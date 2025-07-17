// TacticalMapRenderer.ts

import { Constants, Map, CellData } from './interfaces/Map'
import Options from './interfaces/Options'

export interface InteractiveOptions extends Options {
  canvas: HTMLCanvasElement
  onCellHover?: (
    cell: CellData | null,
    clientX?: number,
    clientY?: number
  ) => void
  onCellClick?: (cellId: number) => void
}

// simple image cache
const assetsCache: Record<string, HTMLImageElement> = {}

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (assetsCache[url]) return assetsCache[url]
  return new Promise((res, rej) => {
    const img = new Image()
    img.src = url
    img.onload  = () => { assetsCache[url] = img; res(img) }
    img.onerror = () => rej(new Error(`Failed to load ${url}`))
  })
}

function makeCircleAsset(color: string, diameter: number): HTMLCanvasElement {
  const cvs = document.createElement('canvas')
  cvs.width = cvs.height = diameter
  const ctx = cvs.getContext('2d')!
  ctx.beginPath()
  ctx.arc(diameter/2, diameter/2, diameter/2 - 2, 0, Math.PI*2)
  ctx.fillStyle = color
  ctx.fill()
  return cvs
}

export class TacticalMapRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly cellMap: Map<number, CellData>
  private lastHoverId: number | null = null

  constructor(
    private readonly map: Map,
    private readonly opts: InteractiveOptions
  ) {
    const ctx = opts.canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot get 2D context')
    this.ctx = ctx

    // map cellNumber → data
    this.cellMap = new Map(
      map.mapData.cellsData.map(c => [c.cellNumber, c] as [number,CellData])
    )

    // events
    opts.canvas.addEventListener('click', this.handleClick.bind(this))
    opts.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this))
    opts.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this))
  }

  private async loadAssets() {
    const { assetPath, displayStartCells, displayPnj, addWatermark } = this.opts

    // base tiles
    const names = { high:'areaUnitHigh', gray:'grayCell', purple:'purpleCell' as const }
    const baseTiles = Object.fromEntries(
      await Promise.all(
        (Object.entries(names) as [keyof typeof names,string][])
          .map(async ([k,f]) => {
            const url = `${assetPath}/${f}.png`
            const img = await loadImage(url)
            return [k,img] as const
          })
      )
    ) as {
      high:HTMLImageElement,
      gray:HTMLImageElement,
      purple:HTMLImageElement
    }

    // circle icons
    const cellW = Constants.CELL_WIDTH
    const assets: any = { ...baseTiles }
    if (displayStartCells) {
      assets.ally  = makeCircleAsset('green',  cellW)
      assets.enemy = makeCircleAsset('red',    cellW)
    }
    if (displayPnj) {
      assets.pnj   = makeCircleAsset('purple', cellW)
    }
    if (addWatermark) {
      assets.logo = await loadImage(`${assetPath}/E-bou.png`)
    }

    return assets as {
      high: HTMLImageElement,
      gray: HTMLImageElement,
      purple: HTMLImageElement,
      ally?: HTMLCanvasElement,
      enemy?: HTMLCanvasElement,
      pnj?: HTMLCanvasElement,
      logo?: HTMLImageElement
    }
  }

  public async render(): Promise<void> {
    const { high, gray, purple, ally, enemy, pnj, logo } = await this.loadAssets()
    const ctx = this.ctx
    const {
      WIDTH, HEIGHT,
      MAP_WIDTH,
      CELL_WIDTH, CELL_HEIGHT,
      CELL_HALF_WIDTH, CELL_HALF_HEIGHT,
      CELL_OFFSET, CELL_DOUBLE_HEIGHT
    } = Constants

    // clear + background
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    for (const cell of this.map.mapData.cellsData) {
      const id  = cell.cellNumber
      const row = Math.floor(id / MAP_WIDTH)
      const col = id % MAP_WIDTH
      const x   = col * CELL_WIDTH + (row % 2) * CELL_HALF_WIDTH
      const y   = row * CELL_HALF_HEIGHT

      let drawn = false

      // 1) if this is the hovered **neutral** cell → draw orange diamond
      if (id === this.lastHoverId && !cell.blue && !cell.red && !cell.pnj) {
        ctx.fillStyle = 'orange'
        ctx.beginPath()
        ctx.moveTo(x + CELL_WIDTH/2, y)
        ctx.lineTo(x + CELL_WIDTH,   y + CELL_HEIGHT/2)
        ctx.lineTo(x + CELL_WIDTH/2, y + CELL_HEIGHT)
        ctx.lineTo(x,                y + CELL_HEIGHT/2)
        ctx.closePath()
        ctx.fill()
        drawn = true

      } else {
        // 2) otherwise draw your normal gray/purple walkable highlight
        if (cell.mov && !cell.nonWalkableDuringFight) {
          const base = row % 2 === 0 ? gray : purple
          ctx.drawImage(base, x, y, CELL_WIDTH, CELL_HEIGHT)
          drawn = true
        }
      }

      // 3) LOS, ally, enemy, pnj, watermark, etc.
      if (!cell.los && !cell.nonWalkableDuringFight) {
        ctx.drawImage(high, x, y + CELL_OFFSET, CELL_WIDTH, CELL_DOUBLE_HEIGHT)
      }
      if (cell.blue && ally && this.opts.displayStartCells) {
        ctx.drawImage(ally, x, y + CELL_OFFSET, CELL_WIDTH, CELL_DOUBLE_HEIGHT)
        drawn = true
      }
      if (cell.red && enemy && this.opts.displayStartCells) {
        ctx.drawImage(enemy, x, y + CELL_OFFSET, CELL_WIDTH, CELL_DOUBLE_HEIGHT)
        drawn = true
      }
      if (cell.pnj && pnj && this.opts.displayPnj) {
        ctx.drawImage(pnj, x, y + CELL_OFFSET, CELL_WIDTH, CELL_DOUBLE_HEIGHT)
        drawn = true
      }
      if (logo) {
        ctx.globalAlpha = 0.3
        const s = 40
        ctx.drawImage(logo, WIDTH - s - 10, HEIGHT - s - 10, s, s)
        ctx.globalAlpha = 1
      }
      if (this.opts.displayCellId && drawn) {
        ctx.fillStyle    = 'white'
        ctx.font         = '12px Arial'
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          id.toString(),
          x + CELL_WIDTH/2,
          y + CELL_HEIGHT/2
        )
      }
    }
  }

  private handleMouseMove(evt: MouseEvent) {
    const rect   = this.opts.canvas.getBoundingClientRect()
    const xRel   = evt.clientX - rect.left
    const yRel   = evt.clientY - rect.top
    const { MAP_WIDTH, CELL_WIDTH, CELL_HALF_WIDTH, CELL_HALF_HEIGHT } = Constants

    const row = Math.floor(yRel / CELL_HALF_HEIGHT)
    const col = Math.floor((xRel - (row % 2)*CELL_HALF_WIDTH) / CELL_WIDTH)
    const newId = (col >= 0 && col < MAP_WIDTH && row >= 0)
      ? row * MAP_WIDTH + col
      : null

    if (newId === this.lastHoverId) {
      // no change
      return
    }

    this.lastHoverId = newId
    // re‑draw with new hover
    this.render()

    // fire hover callback  
    this.opts.onCellHover?.(
      newId != null ? this.cellMap.get(newId)! : null,
      evt.clientX,
      evt.clientY
    )
  }

  private handleMouseLeave() {
    this.lastHoverId = null
    this.render()
    this.opts.onCellHover?.(null)
  }

  private handleClick(evt: MouseEvent) {
    const rect   = this.opts.canvas.getBoundingClientRect()
    const xRel   = evt.clientX - rect.left
    const yRel   = evt.clientY - rect.top
    const { MAP_WIDTH, CELL_WIDTH, CELL_HALF_WIDTH, CELL_HALF_HEIGHT } = Constants

    const row = Math.floor(yRel / CELL_HALF_HEIGHT)
    const col = Math.floor((xRel - (row % 2)*CELL_HALF_WIDTH) / CELL_WIDTH)
    if (col < 0 || col >= MAP_WIDTH || row < 0) return

    const cellId = row * MAP_WIDTH + col
    this.opts.onCellClick?.(cellId)
  }
}
