import { useState, useRef, useCallback, useEffect } from 'react'
import type { BoundingBox, CellData } from '../types/api'
import { Button } from './ui/Button'

export interface TableAnnotation {
  page_number: number
  label: string
  bbox: BoundingBox
  value_string: string  // JSON: { columns: string[], rows: CellData[][] }
}

/** Accept both enriched (CellData[][]) and plain (string[][]) formats */
interface TableInitialData {
  columns: string[]
  rows: CellData[][] | string[][]
}

interface Props {
  labelName: string
  bbox: BoundingBox
  pageNumber: number
  initialData?: TableInitialData
  /** Text picked from an OCR overlay on the canvas (set by parent) */
  pickedText?: string | null
  /** Called when user wants to pick text from overlays; parent enables pick mode */
  onPickModeChange?: (active: boolean) => void
  onSave: (annotation: TableAnnotation) => void
  onClose: () => void
}

const MIN_COL_WEIGHT = 5

/** Default E14 column names in order */
const E14_DEFAULT_COLUMNS = [
  'IDCandidato1', 'Casilla1', 'Casilla2', 'Casilla3',
  'IDCandidato2', 'Casilla4', 'Casilla5', 'Casilla6',
  'IDCandidato3', 'Casilla7', 'Casilla8', 'Casilla9',
]

/** Returns the E14 column name for a given 0-based index, or a generic fallback */
function defaultColumnName(index: number): string {
  return E14_DEFAULT_COLUMNS[index] ?? `Col ${index + 1}`
}

/** Normalize rows: convert string[][] to CellData[][] if needed */
function normalizeRows(rows: CellData[][] | string[][]): CellData[][] {
  if (!rows.length) return []
  // Check if first cell is a string or CellData
  const first = rows[0][0]
  if (typeof first === 'string') {
    return (rows as string[][]).map((row) => row.map((text) => ({ text, bbox: null })))
  }
  return rows as CellData[][]
}

export function TableEditorModal({ labelName, bbox, pageNumber, initialData, pickedText, onPickModeChange, onSave, onClose }: Props) {
  const initCols = initialData?.columns ?? [...E14_DEFAULT_COLUMNS]
  const initRows: CellData[][] = initialData?.rows
    ? normalizeRows(initialData.rows)
    : [E14_DEFAULT_COLUMNS.map(() => ({ text: '', bbox: null }))]
  const [columns, setColumns] = useState<string[]>(initCols)
  const [rows, setRows] = useState<CellData[][]>(initRows)
  // colWeights: relative widths (integers), always sum to 100
  const [colWeights, setColWeights] = useState<number[]>(() => {
    const n = initCols.length
    const even = Math.floor(100 / n)
    const w = Array(n).fill(even)
    w[n - 1] += 100 - even * n
    return w
  })

  const dragInfo = useRef<{ colIdx: number; startX: number; startWeights: number[] } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // --- Draggable modal position ---
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null)
  const modalDrag = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // --- Pick-to-place state ---
  const [pickMode, setPickMode] = useState(false)
  // Buffered text from canvas overlay click, waiting for user to click a cell
  const [bufferedText, setBufferedText] = useState<string | null>(null)
  // Target cell highlighted while in pick mode
  const [targetCell, setTargetCell] = useState<{ ri: number; ci: number } | null>(null)

  // When parent sends pickedText, buffer it (strip \x00counter suffix)
  useEffect(() => {
    if (pickedText != null && pickMode) {
      const clean = pickedText.split('\x00')[0]
      setBufferedText(clean)
    }
  }, [pickedText, pickMode])

  function togglePickMode() {
    const next = !pickMode
    setPickMode(next)
    setBufferedText(null)
    setTargetCell(null)
    onPickModeChange?.(next)
  }

  function handleCellClickInPickMode(ri: number, ci: number) {
    if (!pickMode) return
    if (bufferedText != null) {
      // Place the buffered text in this cell (bbox null since it's manually placed)
      const next = rows.map((r) => [...r])
      next[ri][ci] = { text: bufferedText, bbox: null }
      setRows(next)
      setBufferedText(null)
      setTargetCell(null)
      // Stay in pick mode so user can continue placing
    } else {
      setTargetCell({ ri, ci })
    }
  }

  // --- Draggable modal ---
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = modalRef.current?.getBoundingClientRect()
    const currentX = modalPos?.x ?? rect?.left ?? 0
    const currentY = modalPos?.y ?? rect?.top ?? 0
    modalDrag.current = { startX: e.clientX, startY: e.clientY, startPosX: currentX, startPosY: currentY }
    window.addEventListener('mousemove', onHeaderMouseMove)
    window.addEventListener('mouseup', onHeaderMouseUp)
  }, [modalPos])

  const onHeaderMouseMove = useCallback((e: MouseEvent) => {
    if (!modalDrag.current) return
    const dx = e.clientX - modalDrag.current.startX
    const dy = e.clientY - modalDrag.current.startY
    setModalPos({ x: modalDrag.current.startPosX + dx, y: modalDrag.current.startPosY + dy })
  }, [])

  const onHeaderMouseUp = useCallback(() => {
    modalDrag.current = null
    window.removeEventListener('mousemove', onHeaderMouseMove)
    window.removeEventListener('mouseup', onHeaderMouseUp)
  }, [onHeaderMouseMove])

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onHeaderMouseMove)
      window.removeEventListener('mouseup', onHeaderMouseUp)
    }
  }, [onHeaderMouseMove, onHeaderMouseUp])

  // --- Column operations ---

  function addColumn() {
    insertColumnAt(columns.length)
  }

  function insertColumnAt(position: number) {
    const newCols = [...columns]
    newCols.splice(position, 0, defaultColumnName(columns.length))
    const newRows = rows.map((r) => {
      const nr = [...r]
      nr.splice(position, 0, { text: '', bbox: null })
      return nr
    })
    const newCount = newCols.length
    const even = Math.floor(100 / newCount)
    const remainder = 100 - even * newCount
    const newWeights = Array(newCount).fill(even)
    newWeights[newCount - 1] += remainder
    setColumns(newCols)
    setRows(newRows)
    setColWeights(newWeights)
  }

  function removeColumn(ci: number) {
    if (columns.length <= 1) return
    const newCols = columns.filter((_, i) => i !== ci)
    const newRows = rows.map((r) => r.filter((_, i) => i !== ci))
    const removed = colWeights[ci]
    const newWeights = colWeights.filter((_, i) => i !== ci)
    newWeights[newWeights.length - 1] += removed
    setColumns(newCols)
    setRows(newRows)
    setColWeights(newWeights)
  }

  function updateColumnName(ci: number, name: string) {
    const next = [...columns]
    next[ci] = name
    setColumns(next)
  }

  // --- Row operations ---

  function addRow() {
    insertRowAt(rows.length)
  }

  function insertRowAt(position: number) {
    const newRow = Array.from({ length: columns.length }, () => ({ text: '', bbox: null } as CellData))
    const newRows = [...rows]
    newRows.splice(position, 0, newRow)
    setRows(newRows)
  }

  function removeRow(ri: number) {
    if (rows.length <= 1) return
    setRows(rows.filter((_, i) => i !== ri))
  }

  function updateCell(ri: number, ci: number, value: string) {
    const next = rows.map((r) => [...r])
    // When user edits text manually, clear bbox (it's no longer OCR-accurate)
    next[ri][ci] = { text: value, bbox: rows[ri][ci].bbox }
    setRows(next)
  }

  // --- Column resize via drag ---

  function onResizeMouseDown(ci: number, e: React.MouseEvent) {
    e.preventDefault()
    dragInfo.current = { colIdx: ci, startX: e.clientX, startWeights: [...colWeights] }
    window.addEventListener('mousemove', onResizeMouseMove)
    window.addEventListener('mouseup', onResizeMouseUp)
  }

  function onResizeMouseMove(e: MouseEvent) {
    if (!dragInfo.current) return
    const { colIdx, startX, startWeights } = dragInfo.current
    const dx = e.clientX - startX
    const gridW = gridRef.current?.offsetWidth ?? 600
    const dw = Math.round((dx / gridW) * 100)
    const next = [...startWeights]
    next[colIdx] = Math.max(MIN_COL_WEIGHT, startWeights[colIdx] + dw)
    next[colIdx + 1] = Math.max(MIN_COL_WEIGHT, startWeights[colIdx + 1] - dw)
    const excess = startWeights[colIdx] + startWeights[colIdx + 1] - next[colIdx] - next[colIdx + 1]
    if (excess !== 0) next[colIdx] += excess
    setColWeights(next)
  }

  function onResizeMouseUp() {
    dragInfo.current = null
    window.removeEventListener('mousemove', onResizeMouseMove)
    window.removeEventListener('mouseup', onResizeMouseUp)
  }

  function handleSave() {
    if (pickMode) togglePickMode()
    onSave({
      page_number: pageNumber,
      label: labelName,
      bbox,
      value_string: JSON.stringify({ columns, rows }),  // rows is CellData[][] with bbox per cell
    })
  }

  function handleClose() {
    if (pickMode) onPickModeChange?.(false)
    onClose()
  }

  const totalWeight = colWeights.reduce((a, b) => a + b, 0)

  return (
    <div
      className={`fixed z-50 ${pickMode ? 'bottom-0 left-0 right-0 p-2' : 'inset-0 flex items-center justify-center p-4'}`}
      style={{ backgroundColor: pickMode ? 'transparent' : 'rgba(0,0,0,0.2)', pointerEvents: pickMode ? 'none' : undefined }}
    >
      <div
        ref={modalRef}
        className={`bg-white shadow-2xl flex flex-col ${pickMode ? 'rounded-t-xl max-h-[35vh] w-full' : 'rounded-2xl w-full max-w-4xl max-h-[90vh]'}`}
        style={{
          ...(modalPos ? { position: 'fixed', left: modalPos.x, top: modalPos.y, margin: 0 } : {}),
          pointerEvents: 'auto',
        }}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b border-slate-200 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onHeaderMouseDown}
        >
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Tabla: {labelName}</h2>
              {!pickMode && (
                <p className="text-xs text-slate-500 mt-0.5">{rows.length} filas · {columns.length} columnas · {rows.length * columns.length} celdas</p>
              )}
            </div>
            {/* Pick mode banner inline in header when collapsed */}
            {pickMode && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                {bufferedText != null ? (
                  <>Texto: <strong className="font-mono">"{bufferedText}"</strong> — click en celda para colocar</>
                ) : (
                  <>Click en texto de la imagen, luego en una celda</>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onPickModeChange && (
              <Button
                type="button"
                variant={pickMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={togglePickMode}
              >
                {pickMode ? 'Salir de colocar' : 'Colocar desde imagen'}
              </Button>
            )}
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar — hidden in pick mode */}
        {!pickMode && (
          <div className="flex gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
            <Button type="button" variant="secondary" size="sm" onClick={addColumn}>
              + Columna
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={addRow}>
              + Fila
            </Button>
          </div>
        )}

        {/* Table grid */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div ref={gridRef} className="min-w-max">
            {/* Column headers */}
            <div className="flex">
              {columns.map((col, ci) => (
                <div
                  key={ci}
                  className="relative flex items-center gap-1 border border-slate-300 bg-slate-100 px-2 py-1 group/col"
                  style={{ width: `${(colWeights[ci] / totalWeight) * 100}%`, minWidth: 80 }}
                >
                  <input
                    value={col}
                    onChange={(e) => updateColumnName(ci, e.target.value)}
                    className="flex-1 bg-transparent text-xs font-semibold text-slate-700 focus:outline-none min-w-0"
                    placeholder={`Col ${ci + 1}`}
                  />
                  {!pickMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => insertColumnAt(ci + 1)}
                        title={`Insertar columna después de "${col}"`}
                        className="opacity-0 group-hover/col:opacity-100 text-slate-400 hover:text-blue-500 text-xs leading-none flex-shrink-0 transition-opacity"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                      {columns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeColumn(ci)}
                          className="text-slate-400 hover:text-red-500 text-xs leading-none flex-shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                  {/* Resize handle (not on last column) */}
                  {ci < columns.length - 1 && (
                    <div
                      onMouseDown={(e) => onResizeMouseDown(ci, e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-blue-400/40 hover:bg-blue-500/60 transition-colors z-10"
                    />
                  )}
                </div>
              ))}
              {!pickMode && <div className="w-12 flex-shrink-0" />}
            </div>

            {/* Data rows */}
            {rows.map((row, ri) => (
              <div key={ri} className="flex">
                {row.map((cell, ci) => {
                  const isTarget = pickMode && targetCell?.ri === ri && targetCell?.ci === ci
                  const isPickable = pickMode && bufferedText != null
                  return (
                    <div
                      key={ci}
                      className={`relative border px-2 py-1 transition-colors ${
                        isTarget
                          ? 'border-amber-400 bg-amber-50'
                          : isPickable
                            ? 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer'
                            : 'border-slate-200'
                      }`}
                      style={{ width: `${(colWeights[ci] / totalWeight) * 100}%`, minWidth: 80 }}
                      onClick={() => handleCellClickInPickMode(ri, ci)}
                    >
                      <input
                        value={cell.text}
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-800 focus:outline-none"
                        placeholder="—"
                        readOnly={pickMode && bufferedText != null}
                      />
                      {/* Resize handle */}
                      {ci < columns.length - 1 && (
                        <div
                          onMouseDown={(e) => onResizeMouseDown(ci, e)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/30 transition-colors z-10"
                        />
                      )}
                    </div>
                  )
                })}
                {/* Row actions — hidden in pick mode */}
                {!pickMode && (
                  <div className="w-12 flex-shrink-0 flex items-center justify-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => insertRowAt(ri + 1)}
                      title={`Insertar fila después de la fila ${ri + 1}`}
                      className="text-slate-300 hover:text-blue-500 text-xs leading-none transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(ri)}
                        className="text-slate-300 hover:text-red-500 text-xs leading-none transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button type="button" onClick={handleSave}>
            Guardar tabla ({rows.length * columns.length} celdas)
          </Button>
        </div>
      </div>
    </div>
  )
}
