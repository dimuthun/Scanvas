import { beforeEach, describe, expect, it } from 'vitest'
import { defaultParams } from '@shared/pageMath'
import { excerpt, LibraryRepo, MARK_END, MARK_START } from '../src/main/library/repo'

const newPage = { width: 100, height: 100, outWidth: 100, outHeight: 100, params: defaultParams(), originalExt: 'jpg', processedExt: 'jpg' } as const

let repo: LibraryRepo

beforeEach(() => {
  repo = new LibraryRepo(':memory:')
})

describe('documents and pages', () => {
  it('keeps page order on insert, move and delete', () => {
    const doc = repo.createDocument('Receipts')
    const a = repo.addPage(doc.id, newPage)
    const b = repo.addPage(doc.id, newPage)
    const c = repo.addPage(doc.id, newPage, 0)
    expect(repo.listPages(doc.id).map((p) => p.id)).toEqual([c.id, a.id, b.id])

    repo.movePage(c.id, 2)
    expect(repo.listPages(doc.id).map((p) => p.id)).toEqual([a.id, b.id, c.id])

    repo.deletePage(a.id)
    expect(repo.listPages(doc.id).map((p) => [p.id, p.index])).toEqual([
      [b.id, 0],
      [c.id, 1]
    ])
    const record = repo.getDocument(doc.id)!
    expect(record.pageCount).toBe(2)
    expect(record.cover?.pageId).toBe(b.id)
  })

  it('round-trips params and bumps versions', () => {
    const doc = repo.createDocument('Doc')
    const page = repo.addPage(doc.id, newPage)
    const updated = repo.updatePage(page.id, { params: { ...defaultParams('bw'), angle: 2.5 }, bumpVersion: true, outWidth: 50 })
    expect(updated.params.filter).toBe('bw')
    expect(updated.params.angle).toBe(2.5)
    expect(updated.version).toBe(page.version + 1)
    expect(updated.outWidth).toBe(50)
  })

  it('cascades page deletion with the document', () => {
    const doc = repo.createDocument('Doc')
    repo.addPage(doc.id, newPage)
    repo.deleteDocument(doc.id)
    expect(repo.getDocument(doc.id)).toBeNull()
    expect(repo.listPages(doc.id)).toEqual([])
  })
})

describe('folders and tags', () => {
  it('filters by folder and tag', () => {
    const folder = repo.createFolder('Taxes')
    const inFolder = repo.createDocument('Invoice', folder.id)
    const loose = repo.createDocument('Note')
    repo.updateDocument(loose.id, { tags: ['home', 'todo', 'home'] })

    expect(repo.listDocuments({ folderId: folder.id }).map((h) => h.document.id)).toEqual([inFolder.id])
    expect(repo.listDocuments({ folderId: null }).map((h) => h.document.id)).toEqual([loose.id])
    expect(repo.listDocuments({ tag: 'todo' }).map((h) => h.document.id)).toEqual([loose.id])
    expect(repo.getDocument(loose.id)!.tags).toEqual(['home', 'todo'])
    expect(repo.listFolders()[0].documentCount).toBe(1)

    repo.deleteFolder(folder.id)
    expect(repo.getDocument(inFolder.id)!.folderId).toBeNull()
  })
})

describe('full-text search', () => {
  beforeEach(() => {
    const lease = repo.createDocument('Apartment lease')
    const p1 = repo.addPage(lease.id, newPage)
    const p2 = repo.addPage(lease.id, newPage)
    repo.updatePage(p1.id, { ocrText: 'This agreement is made between the landlord and tenant.' })
    repo.updatePage(p2.id, { ocrText: 'The monthly rent is due on the first day of each month.' })

    const zh = repo.createDocument('发票')
    const p3 = repo.addPage(zh.id, newPage)
    repo.updatePage(p3.id, { ocrText: '扫描全能王桌面版文字识别结果' })
  })

  it('finds OCR text and reports the matching page with a highlighted snippet', () => {
    const [hit] = repo.listDocuments({ text: 'monthly rent' })
    expect(hit.document.title).toBe('Apartment lease')
    expect(hit.pageIndex).toBe(1)
    expect(hit.snippet).toContain(`${MARK_START}monthly rent${MARK_END}`)
  })

  it('matches Chinese substrings', () => {
    const hits = repo.listDocuments({ text: '桌面版' })
    expect(hits.map((h) => h.document.title)).toEqual(['发票'])
  })

  it('matches titles and short queries', () => {
    expect(repo.listDocuments({ text: 'lease' }).map((h) => h.document.title)).toEqual(['Apartment lease'])
    expect(repo.listDocuments({ text: '发票' }).map((h) => h.document.title)).toEqual(['发票'])
  })

  it('updates the index when OCR text changes and treats quotes literally', () => {
    const [hit] = repo.listDocuments({ text: 'landlord' })
    const page = repo.listPages(hit.document.id)[0]
    repo.updatePage(page.id, { ocrText: 'replaced "quoted" text' })
    expect(repo.listDocuments({ text: 'landlord' })).toEqual([])
    expect(repo.listDocuments({ text: '"quoted"' })).toHaveLength(1)
  })
})

describe('excerpt', () => {
  it('marks the match and trims long text', () => {
    expect(excerpt('a'.repeat(100) + 'needle' + 'b'.repeat(100), 'NEEDLE', 5)).toBe(`…aaaaa${MARK_START}needle${MARK_END}bbbbb…`)
  })
})
