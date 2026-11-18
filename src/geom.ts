export type Pt = [number, number]
export type Seg = Pt[] // 1 point: line to it. 3 points: cubic curve (handle, handle, end).
export type Contour = { start: Pt; segs: Seg[] } // always closed
