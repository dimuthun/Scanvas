import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type {
  DocLayout,
  DocumentRecord,
  FolderRecord,
  ImageExt,
  LibraryQuery,
  OcrStatus,
  PageParams,
  PageRecord,
  SearchHit
} from '@shared/types'

const SCHEMA = `
create table if not exists folders (
  id text primary key,
  name text not null,
  created_at integer not null
);
create table if not exists documents (
  id text primary key,
  title text not null,
  folder_id text references folders(id) on delete set null,
  layout text not null default 'pages',
  created_at integer not null,
  updated_at integer not null
);
create table if not exists pages (
  id text primary key,
  doc_id text not null references documents(id) on delete cascade,
  idx integer not null,
  width integer not null,
  height integer not null,
  out_width integer not null,
  out_height integer not null,
  params text not null,
  original_ext text not null,
  processed_ext text not null,
  version integer not null default 1,
  ocr_status text not null default 'none',
  ocr_text text
);
create index if not exists pages_doc on pages(doc_id, idx);
create table if not exists tags (
  doc_id text not null references documents(id) on delete cascade,
  tag text not null,
  primary key (doc_id, tag)
);
create virtual table if not exists search using fts5(
  doc_id unindexed, page_id unindexed, title, body, tokenize = 'trigram'
);
`

export const MARK_START = '\u0001'
export const MARK_END = '\u0002'

interface DocRow {
  id: string
  title: string
  folder_id: string | null
  layout: string
  created_at: number
  updated_at: number
  page_count: number
  cover_id: string | null
  cover_version: number | null
  tags: string | null
}

interface PageRow {
  id: string
  doc_id: string
  idx: number
  width: number
  height: number
  out_width: number
  out_height: number
  params: string
  original_ext: string
  processed_ext: string
  version: number
  ocr_status: string
  ocr_text: string | null
}

const DOC_SELECT = `
select d.*,
  (select count(*) from pages p where p.doc_id = d.id) as page_count,
  (select p.id from pages p where p.doc_id = d.id order by p.idx limit 1) as cover_id,
  (select p.version from pages p where p.doc_id = d.id order by p.idx limit 1) as cover_version,
  (select group_concat(t.tag, char(31)) from tags t where t.doc_id = d.id) as tags
from documents d`

function toDocument(row: DocRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    layout: row.layout as DocLayout,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageCount: row.page_count,
    tags: row.tags ? row.tags.split('\u001f').sort() : [],
    cover: row.cover_id ? { pageId: row.cover_id, version: row.cover_version ?? 0 } : null
  }
}

function toPage(row: PageRow): PageRecord {
  return {
    id: row.id,
    docId: row.doc_id,
    index: row.idx,
    width: row.width,
    height: row.height,
    outWidth: row.out_width,
    outHeight: row.out_height,
    params: JSON.parse(row.params) as PageParams,
    originalExt: row.original_ext as ImageExt,
    processedExt: row.processed_ext as ImageExt,
    version: row.version,
    ocrStatus: row.ocr_status as OcrStatus,
    ocrText: row.ocr_text
  }
}

/** Build a short excerpt around the first case-insensitive occurrence of `needle`. */
export function excerpt(text: string, needle: string, radius = 40): string | null {
  const at = text.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return null
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + needle.length + radius)
  return (
    (start > 0 ? '…' : '') +
    text.slice(start, at) +
    MARK_START +
    text.slice(at, at + needle.length) +
    MARK_END +
    text.slice(at + needle.length, end) +
    (end < text.length ? '…' : '')
  ).replace(/\s+/g, ' ')
}

export interface NewPage {
  id?: string
  width: number
  height: number
  outWidth: number
  outHeight: number
  params: PageParams
  originalExt: ImageExt
  processedExt: ImageExt
}

export interface PagePatch {
  params?: PageParams
  outWidth?: number
  outHeight?: number
  processedExt?: ImageExt
  bumpVersion?: boolean
  ocrStatus?: OcrStatus
  ocrText?: string | null
}

/** All library persistence. Synchronous (node:sqlite) and safe to unit-test with ':memory:'. */
export class LibraryRepo {
  readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('pragma foreign_keys = on; pragma journal_mode = wal;')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('begin')
    try {
      const result = fn()
      this.db.exec('commit')
      return result
    } catch (error) {
      this.db.exec('rollback')
      throw error
    }
  }

  private touch(docId: string): void {
    this.db.prepare('update documents set updated_at = ? where id = ?').run(Date.now(), docId)
  }

  /** Rebuild the full-text rows of one document (one row per page, plus the title). */
  private reindex(docId: string): void {
    this.db.prepare('delete from search where doc_id = ?').run(docId)
    const doc = this.db.prepare('select title from documents where id = ?').get(docId) as { title: string } | undefined
    if (!doc) return
    const pages = this.db.prepare('select id, ocr_text from pages where doc_id = ? order by idx').all(docId) as {
      id: string
      ocr_text: string | null
    }[]
    const insert = this.db.prepare('insert into search (doc_id, page_id, title, body) values (?, ?, ?, ?)')
    insert.run(docId, null, doc.title, '')
    for (const page of pages) if (page.ocr_text) insert.run(docId, page.id, '', page.ocr_text)
  }

  // ------------------------------------------------------------ folders

  listFolders(): FolderRecord[] {
    const rows = this.db
      .prepare(
        `select f.id, f.name, (select count(*) from documents d where d.folder_id = f.id) as document_count
         from folders f order by f.name collate nocase`
      )
      .all() as { id: string; name: string; document_count: number }[]
    return rows.map((r) => ({ id: r.id, name: r.name, documentCount: r.document_count }))
  }

  createFolder(name: string): FolderRecord {
    const id = randomUUID()
    this.db.prepare('insert into folders (id, name, created_at) values (?, ?, ?)').run(id, name.trim() || 'Folder', Date.now())
    return { id, name: name.trim() || 'Folder', documentCount: 0 }
  }

  renameFolder(id: string, name: string): void {
    this.db.prepare('update folders set name = ? where id = ?').run(name.trim() || 'Folder', id)
  }

  deleteFolder(id: string): void {
    this.db.prepare('delete from folders where id = ?').run(id)
  }

  // ------------------------------------------------------------ documents

  createDocument(title: string, folderId: string | null = null, layout: DocLayout = 'pages'): DocumentRecord {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare('insert into documents (id, title, folder_id, layout, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
      .run(id, title, folderId, layout, now, now)
    this.reindex(id)
    return this.getDocument(id)!
  }

  getDocument(id: string): DocumentRecord | null {
    const row = this.db.prepare(`${DOC_SELECT} where d.id = ?`).get(id) as DocRow | undefined
    return row ? toDocument(row) : null
  }

  updateDocument(id: string, patch: { title?: string; folderId?: string | null; layout?: DocLayout; tags?: string[] }): void {
    this.transaction(() => {
      if (patch.title !== undefined) this.db.prepare('update documents set title = ? where id = ?').run(patch.title, id)
      if (patch.folderId !== undefined) this.db.prepare('update documents set folder_id = ? where id = ?').run(patch.folderId, id)
      if (patch.layout !== undefined) this.db.prepare('update documents set layout = ? where id = ?').run(patch.layout, id)
      if (patch.tags !== undefined) {
        this.db.prepare('delete from tags where doc_id = ?').run(id)
        const insert = this.db.prepare('insert or ignore into tags (doc_id, tag) values (?, ?)')
        for (const tag of patch.tags.map((t) => t.trim()).filter(Boolean)) insert.run(id, tag)
      }
      this.touch(id)
      if (patch.title !== undefined) this.reindex(id)
    })
  }

  deleteDocument(id: string): void {
    this.transaction(() => {
      this.db.prepare('delete from search where doc_id = ?').run(id)
      this.db.prepare('delete from documents where id = ?').run(id)
    })
  }

  listTags(): string[] {
    return (this.db.prepare('select distinct tag from tags order by tag collate nocase').all() as { tag: string }[]).map((r) => r.tag)
  }

  /** Documents filtered by folder/tag and optionally a full-text query (title + OCR text). */
  listDocuments(query: LibraryQuery = {}): SearchHit[] {
    const where: string[] = []
    const args: (string | null)[] = []
    if (query.folderId !== undefined) {
      if (query.folderId === null) where.push('d.folder_id is null')
      else {
        where.push('d.folder_id = ?')
        args.push(query.folderId)
      }
    }
    if (query.tag) {
      where.push('exists (select 1 from tags t where t.doc_id = d.id and t.tag = ?)')
      args.push(query.tag)
    }
    const sql = `${DOC_SELECT}${where.length ? ` where ${where.join(' and ')}` : ''} order by d.updated_at desc`
    const docs = (this.db.prepare(sql).all(...args) as unknown as DocRow[]).map(toDocument)

    const text = query.text?.trim()
    if (!text) return docs.map((document) => ({ document, snippet: null, pageIndex: null }))

    const hits = this.textHits(text)
    const byId = new Map(docs.map((d) => [d.id, d]))
    const result: SearchHit[] = []
    for (const hit of hits) {
      const document = byId.get(hit.docId)
      if (document) result.push({ document, snippet: hit.snippet, pageIndex: hit.pageIndex })
    }
    return result
  }

  /** Best hit per document, best-ranked documents first. */
  private textHits(text: string): { docId: string; snippet: string | null; pageIndex: number | null }[] {
    let rows: { doc_id: string; page_id: string | null; title: string; body: string }[]
    if ([...text].length >= 3) {
      // The trigram tokenizer gives substring matching for any script, including CJK.
      // (Its snippet() counts trigrams, not words, so excerpts are built in JS instead.)
      const phrase = `"${text.replace(/"/g, '""')}"`
      rows = this.db
        .prepare('select doc_id, page_id, title, body from search where search match ? order by rank')
        .all(phrase) as typeof rows
    } else {
      const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      rows = this.db
        .prepare(`select doc_id, page_id, title, body from search where title like ? escape '\\' or body like ? escape '\\'`)
        .all(like, like) as typeof rows
    }
    const pageIndex = this.db.prepare('select idx from pages where id = ?')
    const seen = new Set<string>()
    const hits: { docId: string; snippet: string | null; pageIndex: number | null }[] = []
    for (const row of rows) {
      if (seen.has(row.doc_id)) continue
      seen.add(row.doc_id)
      const isPage = row.page_id !== null
      const snippet = isPage ? excerpt(row.body, text) : null
      const index = isPage ? ((pageIndex.get(row.page_id) as { idx: number } | undefined)?.idx ?? null) : null
      hits.push({ docId: row.doc_id, snippet, pageIndex: index })
    }
    return hits
  }

  // ------------------------------------------------------------ pages

  listPages(docId: string): PageRecord[] {
    return (this.db.prepare('select * from pages where doc_id = ? order by idx').all(docId) as unknown as PageRow[]).map(toPage)
  }

  getPage(id: string): PageRecord | null {
    const row = this.db.prepare('select * from pages where id = ?').get(id) as PageRow | undefined
    return row ? toPage(row) : null
  }

  /** Insert a page at `index` (default: end), shifting later pages. */
  addPage(docId: string, page: NewPage, index?: number): PageRecord {
    const id = page.id ?? randomUUID()
    this.transaction(() => {
      const count = (this.db.prepare('select count(*) as n from pages where doc_id = ?').get(docId) as { n: number }).n
      const at = index === undefined ? count : Math.max(0, Math.min(index, count))
      this.db.prepare('update pages set idx = idx + 1 where doc_id = ? and idx >= ?').run(docId, at)
      this.db
        .prepare(
          `insert into pages (id, doc_id, idx, width, height, out_width, out_height, params, original_ext, processed_ext)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, docId, at, page.width, page.height, page.outWidth, page.outHeight, JSON.stringify(page.params), page.originalExt, page.processedExt)
      this.touch(docId)
    })
    return this.getPage(id)!
  }

  updatePage(id: string, patch: PagePatch): PageRecord {
    const page = this.getPage(id)
    if (!page) throw new Error(`Page ${id} not found`)
    this.transaction(() => {
      const sets: string[] = []
      const args: (string | number | null)[] = []
      const set = (column: string, value: string | number | null): void => {
        sets.push(`${column} = ?`)
        args.push(value)
      }
      if (patch.params) set('params', JSON.stringify(patch.params))
      if (patch.outWidth !== undefined) set('out_width', patch.outWidth)
      if (patch.outHeight !== undefined) set('out_height', patch.outHeight)
      if (patch.processedExt) set('processed_ext', patch.processedExt)
      if (patch.ocrStatus) set('ocr_status', patch.ocrStatus)
      if (patch.ocrText !== undefined) set('ocr_text', patch.ocrText)
      if (patch.bumpVersion) sets.push('version = version + 1')
      if (sets.length) this.db.prepare(`update pages set ${sets.join(', ')} where id = ?`).run(...args, id)
      this.touch(page.docId)
      if (patch.ocrText !== undefined) this.reindex(page.docId)
    })
    return this.getPage(id)!
  }

  deletePage(id: string): void {
    const page = this.getPage(id)
    if (!page) return
    this.transaction(() => {
      this.db.prepare('delete from pages where id = ?').run(id)
      this.db.prepare('update pages set idx = idx - 1 where doc_id = ? and idx > ?').run(page.docId, page.index)
      this.touch(page.docId)
      this.reindex(page.docId)
    })
  }

  /** Move a page to a new 0-based position within its document. */
  movePage(id: string, toIndex: number): void {
    const page = this.getPage(id)
    if (!page) return
    this.transaction(() => {
      const ids = this.listPages(page.docId).map((p) => p.id).filter((pid) => pid !== id)
      ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id)
      const update = this.db.prepare('update pages set idx = ? where id = ?')
      ids.forEach((pid, i) => update.run(-1 - i, pid)) // avoid transient duplicates
      ids.forEach((pid, i) => update.run(i, pid))
      this.touch(page.docId)
    })
  }
}
