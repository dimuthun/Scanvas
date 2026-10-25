import { useCallback, useEffect, useState } from 'react'
import {
  Download,
  FileDown,
  FileStack,
  Folder,
  FolderOpen,
  FolderPlus,
  Images,
  Inbox,
  Layers,
  MoreHorizontal,
  Pencil,
  Printer,
  ScanLine,
  ScanText,
  Search,
  Settings,
  Tag,
  Trash2,
  X
} from 'lucide-react'
import type { Translate } from '@shared/i18n'
import { pageAssetUrl } from '@shared/pageMath'
import type { DocumentRecord, FolderRecord, LibraryQuery, PageSource, SearchHit } from '@shared/types'
import { Dropdown } from '../common/Dropdown'
import { useAppInfo, useLibraryRefresh } from '../common/hooks'
import { Modal, usePrompt } from '../common/Modal'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { EmptyState, IconButton, SkeletonImage } from '../ui/controls'

/** Folder selection in the sidebar: everything, unfiled documents, one folder, or a tag. */
type Scope = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string } | { kind: 'tag'; tag: string }

const DRAG_TYPE = 'application/x-scanvas-document'

function Snippet({ text }: { text: string }): React.JSX.Element {
  // Matches are wrapped in \u0001 … \u0002 by the search index.
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/)
  return (
    <p className="snippet">
      {parts.map((part, i) => (part.startsWith('\u0001') ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>))}
    </p>
  )
}

function MoveDialog({ t, folders, current, onClose }: { t: Translate; folders: FolderRecord[]; current: string | null; onClose(value: string | null | undefined): void }): React.JSX.Element {
  const [value, setValue] = useState(current ?? '')
  return (
    <Modal title={t('libraryMove')} onClose={() => onClose(undefined)}>
      <select value={value} onChange={(e) => setValue(e.target.value)} style={{ width: '100%' }} autoFocus>
        <option value="">{t('libraryNoFolder')}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <div className="modal-actions">
        <button onClick={() => onClose(undefined)}>{t('commonCancel')}</button>
        <button className="primary" onClick={() => onClose(value || null)}>
          {t('commonOk')}
        </button>
      </div>
    </Modal>
  )
}

export function LibraryPage(): React.JSX.Element {
  const t = useTranslator()
  const info = useAppInfo()
  const [promptModal, prompt] = usePrompt(t)
  const [scope, setScope] = useState<Scope>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [moving, setMoving] = useState<DocumentRecord | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  useEffect(() => {
    document.title = t('libraryTitle')
  }, [t])

  const load = useCallback(() => {
    const query: LibraryQuery = { text: search.trim() || undefined }
    if (scope.kind === 'unfiled') query.folderId = null
    else if (scope.kind === 'folder') query.folderId = scope.id
    else if (scope.kind === 'tag') query.tag = scope.tag
    void window.api.listDocuments(query).then(setHits)
    void window.api.listFolders().then(setFolders)
    void window.api.listTags().then(setTags)
  }, [scope, search])

  useLibraryRefresh(load)
  useEffect(() => {
    const timer = window.setTimeout(load, 150)
    return () => window.clearTimeout(timer)
  }, [load])

  const folderId = scope.kind === 'folder' ? scope.id : null
  const newScan = (source: PageSource): void => void window.api.createDocument(source, folderId)

  const newFolder = async (): Promise<void> => {
    const name = await prompt({ title: t('libraryNewFolder'), label: t('libraryFolderName') })
    if (!name) return
    const folder = await window.api.createFolder(name)
    setScope({ kind: 'folder', id: folder.id })
  }

  const renameFolder = async (folder: FolderRecord): Promise<void> => {
    const name = await prompt({ title: t('libraryRenameFolder'), label: t('libraryFolderName'), initial: folder.name })
    if (name) await window.api.renameFolder(folder.id, name)
  }

  const deleteFolder = async (folder: FolderRecord): Promise<void> => {
    if (!window.confirm(t('libraryDeleteFolderConfirm', { name: folder.name }))) return
    await window.api.deleteFolder(folder.id)
    if (scope.kind === 'folder' && scope.id === folder.id) setScope({ kind: 'all' })
  }

  const rename = async (doc: DocumentRecord): Promise<void> => {
    const title = await prompt({ title: t('libraryRename'), label: t('libraryTitleLabel'), initial: doc.title })
    if (title) await window.api.updateDocument(doc.id, { title })
  }

  const editTags = async (doc: DocumentRecord): Promise<void> => {
    const value = await prompt({ title: t('libraryEditTags'), initial: doc.tags.join(', '), hint: t('libraryTagsHint') })
    if (value === null) return
    await window.api.updateDocument(doc.id, { tags: value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
  }

  const remove = async (doc: DocumentRecord): Promise<void> => {
    if (window.confirm(t('libraryDeleteConfirm', { title: doc.title }))) await window.api.deleteDocument(doc.id)
  }

  const folderDropProps = (key: string, target: string | null) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
      event.preventDefault()
      setDropTarget(key)
    },
    onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      setDropTarget(null)
      const docId = event.dataTransfer.getData(DRAG_TYPE)
      if (docId) void window.api.updateDocument(docId, { folderId: target })
    }
  })

  const isActive = (s: Scope): boolean => JSON.stringify(s) === JSON.stringify(scope)
  const navClass = (s: Scope, dropKey?: string): string =>
    ['nav-item', isActive(s) && 'active', dropKey && dropTarget === dropKey && 'drop'].filter(Boolean).join(' ')

  const scanItems = [
    { label: t('libraryFromImages'), icon: Images, onSelect: () => newScan('images') },
    { label: t('libraryFromFolder'), icon: FolderOpen, onSelect: () => newScan('folder') },
    { label: t('libraryFromPdf'), icon: FileStack, onSelect: () => newScan('pdf') },
    { label: t('libraryFromScanner'), icon: Printer, onSelect: () => newScan('scanner'), hidden: info?.platform !== 'win32' }
  ]

  return (
    <AppShell
      title={t('libraryTitle')}
      center={
        <div className="search-field">
          <Search />
          <input type="search" placeholder={t('librarySearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }
      actions={
        <>
          <IconButton icon={ScanText} label={t('libraryOcr')} onClick={() => void window.api.startCapture()} />
          <IconButton icon={FileStack} label={t('pdfToolsTitle')} onClick={() => void window.api.openWindow('pdftools')} />
          <IconButton icon={Download} label={t('libraryDownloads')} onClick={() => void window.api.openWindow('downloads')} />
          <IconButton icon={Settings} label={t('settingsTitle')} onClick={() => void window.api.openWindow('settings')} />
        </>
      }
    >
      <div className="library-body">
        <nav className="sidebar glass">
          <Dropdown label={t('libraryNew')} icon={ScanLine} primary items={scanItems} triggerClass="new-scan" />

          <div className="nav-group">
            <button className={navClass({ kind: 'all' })} onClick={() => setScope({ kind: 'all' })}>
              <Layers /> <span className="nav-label">{t('libraryAll')}</span>
            </button>
            <button className={navClass({ kind: 'unfiled' }, 'unfiled')} onClick={() => setScope({ kind: 'unfiled' })} {...folderDropProps('unfiled', null)}>
              <Inbox /> <span className="nav-label">{t('libraryUnfiled')}</span>
            </button>
          </div>

          <div className="panel-title nav-heading">
            <span>{t('libraryFolders')}</span>
            <IconButton icon={FolderPlus} label={t('libraryNewFolder')} small onClick={() => void newFolder()} />
          </div>
          <div className="nav-group">
            {folders.map((folder) => (
              <div key={folder.id} className={navClass({ kind: 'folder', id: folder.id }, folder.id)} {...folderDropProps(folder.id, folder.id)}>
                <button className="nav-main" onClick={() => setScope({ kind: 'folder', id: folder.id })}>
                  <Folder /> <span className="nav-label">{folder.name}</span>
                </button>
                <span className="badge count">{folder.documentCount}</span>
                <span className="nav-tools">
                  <IconButton icon={Pencil} label={t('libraryRenameFolder')} small onClick={() => void renameFolder(folder)} />
                  <IconButton icon={X} label={t('libraryDeleteFolder')} small onClick={() => void deleteFolder(folder)} />
                </span>
              </div>
            ))}
          </div>

          {tags.length > 0 && (
            <>
              <div className="panel-title nav-heading">
                <span>{t('libraryTags')}</span>
              </div>
              <div className="tag-list">
                {tags.map((tag) => (
                  <button key={tag} className={`chip tag${isActive({ kind: 'tag', tag }) ? ' active' : ''}`} onClick={() => setScope({ kind: 'tag', tag })}>
                    <Tag /> {tag}
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>

        <main className="documents">
          {hits && hits.length === 0 &&
            (search.trim() ? (
              <EmptyState title={t('libraryNoResults')} />
            ) : (
              <EmptyState title={t('libraryNew')} description={t('libraryEmpty')}>
                <button className="primary" onClick={() => newScan('images')}>
                  <Images /> {t('libraryFromImages')}
                </button>
                <button onClick={() => newScan('pdf')}>
                  <FileStack /> {t('libraryFromPdf')}
                </button>
                <button onClick={() => void window.api.startCapture()}>
                  <ScanText /> {t('libraryOcr')}
                </button>
              </EmptyState>
            ))}
          <div className="grid">
            {hits?.map(({ document: doc, snippet, pageIndex }, i) => (
              <article
                key={doc.id}
                className="doc-card card"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, doc.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDoubleClick={() => void window.api.openDocument(doc.id)}
              >
                <button className="thumb" onClick={() => void window.api.openDocument(doc.id)} aria-label={`${t('libraryOpen')} ${doc.title}`}>
                  {doc.cover ? (
                    <SkeletonImage src={pageAssetUrl({ docId: doc.id, id: doc.cover.pageId, version: doc.cover.version }, 'thumb')} />
                  ) : (
                    <span className="skeleton-image skeleton" />
                  )}
                  <span className="badge page-count">{doc.pageCount === 1 ? t('libraryPageOne') : t('libraryPages', { count: doc.pageCount })}</span>
                </button>
                <div className="card-body">
                  <div className="card-title">
                    <h3 title={doc.title}>{doc.title}</h3>
                    <Dropdown
                      icon={MoreHorizontal}
                      ariaLabel={t('libraryOpen')}
                      align="right"
                      items={[
                        { label: t('libraryOpen'), icon: FolderOpen, onSelect: () => void window.api.openDocument(doc.id) },
                        { label: t('libraryRename'), icon: Pencil, onSelect: () => void rename(doc) },
                        { label: t('libraryMove'), icon: Folder, onSelect: () => setMoving(doc) },
                        { label: t('libraryEditTags'), icon: Tag, onSelect: () => void editTags(doc) },
                        { label: t('libraryExportPdf'), icon: FileDown, onSelect: () => void window.api.exportDocument(doc.id, 'pdf'), disabled: doc.pageCount === 0 },
                        { label: t('libraryDelete'), icon: Trash2, onSelect: () => void remove(doc) }
                      ]}
                    />
                  </div>
                  <p className="meta">
                    {new Date(doc.updatedAt).toLocaleDateString(info?.locale)}
                    {pageIndex !== null && <span className="badge accent">{t('libraryMatchPage', { page: pageIndex + 1 })}</span>}
                  </p>
                  {doc.tags.length > 0 && (
                    <div className="tags">
                      {doc.tags.map((tag) => (
                        <span key={tag} className="chip">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {snippet && <Snippet text={snippet} />}
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>

      {moving && (
        <MoveDialog
          t={t}
          folders={folders}
          current={moving.folderId}
          onClose={(value) => {
            if (value !== undefined) void window.api.updateDocument(moving.id, { folderId: value })
            setMoving(null)
          }}
        />
      )}
      {promptModal}
    </AppShell>
  )
}
