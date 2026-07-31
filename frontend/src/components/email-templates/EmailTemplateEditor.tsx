import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Bold, Code2, Eye, Italic, Link2, List, ListOrdered } from 'lucide-react'

interface EmailTemplateEditorProps {
  value: string
  variables: string[]
  onChange: (html: string) => void
  disabled?: boolean
}

type EditorMode = 'visual' | 'html'

const toolbarButtonBase =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

export function EmailTemplateEditor({ value, variables, onChange, disabled = false }: EmailTemplateEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Link.configure({
        autolink: true,
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Escreva o conteudo do email...',
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor || mode !== 'visual') return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, mode, value])

  function insertVariable(variable: string) {
    if (disabled) return

    const token = `{{${variable}}}`
    if (mode === 'html') {
      const textarea = textareaRef.current
      const start = textarea?.selectionStart ?? value.length
      const end = textarea?.selectionEnd ?? value.length
      onChange(`${value.slice(0, start)}${token}${value.slice(end)}`)
      window.requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(start + token.length, start + token.length)
      })
      return
    }

    editor?.chain().focus().insertContent(token).run()
  }

  function toggleLink() {
    if (!editor || disabled) return

    const currentHref = editor.getAttributes('link').href as string | undefined
    const nextHref = window.prompt('URL do link', currentHref ?? '')
    if (nextHref === null) return
    if (!nextHref.trim()) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: nextHref.trim() }).run()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium ${
              mode === 'visual' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setMode('visual')}
            disabled={disabled}
          >
            <Eye className="h-4 w-4" />
            Visual
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium ${
              mode === 'html' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setMode('html')}
            disabled={disabled}
          >
            <Code2 className="h-4 w-4" />
            HTML
          </button>
        </div>

        {mode === 'visual' && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={`${toolbarButtonBase} ${editor?.isActive('bold') ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={disabled || !editor}
              title="Negrito"
              aria-label="Negrito"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${toolbarButtonBase} ${editor?.isActive('italic') ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={disabled || !editor}
              title="Italico"
              aria-label="Italico"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${toolbarButtonBase} ${editor?.isActive('bulletList') ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={disabled || !editor}
              title="Lista com marcadores"
              aria-label="Lista com marcadores"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${toolbarButtonBase} ${editor?.isActive('orderedList') ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              disabled={disabled || !editor}
              title="Lista numerada"
              aria-label="Lista numerada"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${toolbarButtonBase} ${editor?.isActive('link') ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={toggleLink}
              disabled={disabled || !editor}
              title="Link"
              aria-label="Link"
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {variables.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {variables.map(variable => (
            <button
              key={variable}
              type="button"
              className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => insertVariable(variable)}
              disabled={disabled}
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
      )}

      {mode === 'visual' ? (
        <div className="min-h-[220px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none [&_.ProseMirror]:min-h-[190px] [&_.ProseMirror]:outline-none"
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="min-h-[220px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          spellCheck={false}
          aria-label="HTML do modelo de email"
        />
      )}
    </div>
  )
}
