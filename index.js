const assign = require('lodash').assign
const entries = require('lodash').entries
const omit = require('lodash').omit
const mercator = require('global-mercator')
const tiletype = require('@mapbox/tiletype')
const utils = require('./utils')
const schema = require('./schema')

/**
 * MBTiles
 */
module.exports = class MBTiles {
  /**
   * MBTiles
   *
   * @param {string} uri Path to MBTiles
   * @returns {MBTiles} MBTiles
   * @example
   * const mbtiles = new MBTiles('example.mbtiles')
   * //=mbtiles
   */
  constructor (uri) {
    this.db = utils.connect(uri)
    this.uri = uri
    this.version = '1.1.0'
    this.type = 'baselayer'
    this.errors = []
    this.ok = true
  }

  /**
   * Save buffer data to individual Tile
   *
   * @param {Tile} tile Tile [x, y, z]
   * @param {Buffer} image Tile image
   * @returns {Promise<boolean>}
   * @example
   * mbtiles.save([x, y, z], buffer)
   *   .then(status => console.log(status))
   */
  save (tile, image) {
    const [x, y, z] = tile
    return new Promise((resolve, reject) => {
      this.tables().then(() => {
        const query = 'INSERT INTO tiles (tile_column, tile_row, zoom_level, tile_data) VALUES (?, ?, ?, ?)'
        this.db.run(query, [x, y, z, image], error => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(false)
          }
          return resolve(true)
        })
      })
    })
  }

  /**
   * Retrieves Metadata from MBTiles
   *
   * @returns {Promise<Metadata>} Metadata as an Object
   * @example
   * mbtiles.metadata()
   *   .then(metadata => console.log(metadata))
   */
  metadata () {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(schema.TABLE.metadata, error => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve({})
          }
        })
        this.db.all('SELECT * FROM metadata', (error, rows) => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(undefined)
          }

          const metadata = utils.parseMetadata(rows)
          this.minzoom = metadata.minzoom
          this.maxzoom = metadata.maxzoom
          this.attribution = metadata.attribution || this.attribution
          this.description = metadata.description || this.description
          this.name = metadata.name || this.name
          this.type = metadata.type || this.type
          this.version = metadata.version || this.version
          this.url = metadata.url || this.url
          const bounds = metadata.bounds || this.bounds
          if (bounds) {
            const bbox = utils.parseBounds(bounds)
            this.bounds = bbox
            this.center = mercator.bboxToCenter(bbox)
          }

          this.getFormat().then(format => {
            this.getMinZoom().then(minZoom => {
              this.getMaxZoom().then(maxZoom => {
                this.getBounds().then(bounds => {
                  const exclude = ['_table', '_index', 'db', 'uri', 'ok', 'errors']
                  const results = JSON.parse(JSON.stringify(omit(this, exclude)))
                  return resolve(results)
                })
              })
            })
          })
        })
      })
    })
  }

  /**
   * Delete individual Tile
   *
   * @param {Tile} tile Tile [x, y, z]
   * @returns {Promise<boolean>}
   * @example
   * mbtiles.delete([x, y, z])
   *   .then(status => console.log(status))
   */
  delete (tile) {
    return new Promise((resolve, reject) => {
      this.tables().then(() => {
        const query = 'DELETE FROM tiles WHERE tile_column=? AND tile_row=? AND zoom_level=?'
        this.db.run(query, tile, error => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            resolve(false)
          }
          return resolve(true)
        })
      })
    })
  }

  /**
   * Retrieves Minimum Zoom level
   *
   * @returns {Promise<number>}
   * @example
   * mbtiles.getMinZoom()
   *   .then(minZoom => console.log(minZoom))
   */
  getMinZoom () {
    return new Promise((resolve, reject) => {
      if (this.minzoom !== undefined) { return resolve(this.minzoom) }
      this.tables().then(() => {
        this.db.get('SELECT MIN(zoom_level) FROM tiles', (error, row) => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(undefined)
          }
          if (row === undefined || row === null) { return resolve(undefined) }

          const minzoom = row['MIN(zoom_level)']
          if (minzoom === null || minzoom === undefined) { return resolve(undefined) }
          this.minzoom = minzoom
          return resolve(minzoom)
        })
      })
    })
  }

  /**
   * Retrieves Maximum Zoom level
   *
   * @returns {Promise<number>}
   * @example
   * mbtiles.getMaxZoom()
   *   .then(maxZoom => console.log(maxZoom))
   */
  getMaxZoom () {
    return new Promise((resolve, reject) => {
      if (this.db === undefined) { return resolve(undefined) }
      if (this.maxzoom !== undefined) { return resolve(this.maxzoom) }
      this.tables().then(() => {
        this.db.get('SELECT MAX(zoom_level) FROM tiles', (error, row) => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(undefined)
          }
          if (row === undefined || row === null) { return resolve(undefined) }

          const maxzoom = row['MAX(zoom_level)']
          if (maxzoom === null || maxzoom === undefined) { return resolve(undefined) }
          this.maxzoom = maxzoom
          return resolve(maxzoom)
        })
      })
    })
  }

  /**
   * Retrieves Image Format
   *
   * @returns {Promise<Formats>}
   * @example
   * mbtiles.getFormat()
   *   .then(format => console.log(format))
   */
  getFormat () {
    return new Promise((resolve, reject) => {
      if (this.format !== undefined) { return resolve(this.format) }
      this.tables().then(() => {
        this.db.get('SELECT tile_data FROM tiles LIMIT 1', (error, row) => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(undefined)
          }
          if (row === undefined || row === null) { return resolve(undefined) }

          const format = tiletype.type(row['tile_data'])
          if (format === undefined || format === null) { return resolve(undefined) }
          this.format = format
          return resolve(format)
        })
      })
    })
  }

  /**
   * Retrieves Bounds
   *
   * @param {number} zoom Zoom level
   * @returns {Promise<BBox>}
   * @example
   * mbtiles.getBounds()
   *   .then(bbox => console.log(bbox))
   */
  getBounds (zoom) {
    return new Promise((resolve, reject) => {
      if (this.bounds !== undefined) { return resolve(this.bounds) }
      this.tables().then(() => {
        this.getMaxZoom().then(maxzoom => {
          this.getMinZoom().then(minzoom => {
            // Validate zoom input based on Min & Max zoom levels
            let zoomLevel = (zoom === undefined) ? maxzoom : zoom
            if (zoom > maxzoom) { zoomLevel = maxzoom }
            if (zoom < minzoom) { zoomLevel = minzoom }

            const query = 'SELECT MIN(tile_column), MIN(tile_row), MAX(tile_column), MAX(tile_row) FROM tiles WHERE zoom_level=?'
            this.db.get(query, zoomLevel, (error, row) => {
              if (error) {
                utils.warning(error)
                this.errors.push(error)
                this.ok = false
                return resolve(undefined)
              }
              if (row === undefined || row === null) { return resolve(undefined) }
              if (zoomLevel === undefined || zoomLevel === null) { return resolve(undefined) }

              // Retrieve BBox from southwest & northeast tiles
              const southwest = mercator.tileToBBox([row['MIN(tile_column)'], row['MIN(tile_row)'], zoomLevel])
              const northeast = mercator.tileToBBox([row['MAX(tile_column)'], row['MAX(tile_row)'], zoomLevel])
              const [west, south] = southwest.slice(0, 2)
              const [east, north] = northeast.slice(2, 4)

              const bbox = [west, south, east, north]
              this.bounds = bbox
              this.center = mercator.bboxToCenter(bbox)
              return resolve(bbox)
            })
          })
        })
      })
    })
  }

  /**
   * Count the amount of Tiles
   *
   * @param {Tile[]} [tiles] Only find given tiles
   * @returns {Promise<number>}
   * @example
   * mbtiles.count()
   *   .then(count => console.log(count))
   */
  count (tiles) {
    return new Promise(resolve => {
      this.findAll(tiles).then(existingTiles => {
        return resolve(existingTiles.length)
      })
    })
  }

  /**
   * Update Metadata
   *
   * @param {Metadata} [metadata={}] Metadata according to MBTiles spec 1.1.0
   * @param {string} metadata.attribution Attribution
   * @param {BBox} metadata.bounds BBox [west, south, east, north] or Polygon GeoJSON
   * @param {Center} metadata.center Center [lng, lat] or [lng, lat, height]
   * @param {string} metadata.description Description
   * @param {Formats} metadata.format Format 'png' | 'jpg' | 'webp' | 'pbf'
   * @param {number} metadata.minzoom Minimum zoom level
   * @param {number} metadata.maxzoom Maximum zoom level
   * @param {string} metadata.name Name
   * @param {string} metadata.url URL source or tile scheme
   * @param {Types} [metadata.type='baselayer'] Type 'baselayer' | 'overlay'
   * @param {Versions} [metadata.version='1.1.0'] Version '1.0.0' | '1.1.0' | '1.2.0'
   * @returns {Promise<Metadata>} Metadata
   * @example
   * const options = {
   *   name: 'Foo',
   *   description: 'Bar',
   *   minzoom: 1,
   *   maxzoom: 3,
   *   format: 'png',
   *   bounds: [-110, -40, 95, 50]
   * }
   * mbtiles.update(options)
   *   .then(metadata => console.log(metadata))
   */
  update (metadata = {}) {
    return new Promise((resolve, reject) => {
      this.metadata().then(currentMetadata => {
        this.db.serialize(() => {
          this.db.run(schema.TABLE.metadata, error => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(undefined)
            }
          })
          this.db.run('DELETE FROM metadata', error => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(undefined)
            }
          })
          if (metadata.bounds) { metadata.bounds = utils.parseBounds(metadata.bounds) }
          const results = assign(currentMetadata, metadata)

          // Load Metadata to database
          const stmt = this.db.prepare('INSERT INTO metadata VALUES (?, ?)')
          for (const [name, value] of entries(results)) {
            // String or Number
            let query
            if (typeof value !== 'object') {
              query = [name, String(value)]
            // Array
            } else if (value.length) {
              query = [name, value.join(',')]
            // JSON
            } else {
              query = [name, JSON.stringify(value)]
            }
            stmt.run(query, error => {
              if (error) {
                utils.warning(error)
                this.errors.push(error)
                this.ok = false
                return resolve(undefined)
              }
            })
          }
          stmt.finalize(error => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(undefined)
            }
            return resolve(results)
          })
        })
      })
    })
  }

  /**
   * Validate MBTiles according to the specifications
   *
   * @returns Promise<boolean>
   * @example
   * mbtiles.validate()
   *  .then(status => console.log(status), error => console.log(error))
   */
  validate () {
    return new Promise(resolve => {
      this.metadata().then(metadata => {
        if (this.errors.length) { utils.error(this.errors) }

        // MBTiles spec 1.0.0
        if (metadata.name === undefined) { utils.error('Metadata <name> is required') }
        if (metadata.format === undefined) { utils.error('Metadata <format> is required') }
        if (metadata.version === undefined) { utils.error('Metadata <version> is required') }
        if (metadata.type === undefined) { utils.error('Metadata <type> is required') }

        // MBTiles spec 1.1.0
        if (metadata.version === '1.1.0') {
          if (metadata.bounds === undefined) { utils.error('Metadata <bounds> is required') }
        }
      })
      return resolve(true)
    })
  }

  /**
   * Finds all Tile unique hashes
   *
   * @param {Tile[]} [tiles] Only find given tiles
   * @returns {Promise<Tile[]>} An array of Tiles [x, y, z]
   * @example
   * const tile1 = [33, 40, 6]
   * const tile2 = [20, 50, 7]
   * mbtiles.findAll([tile1, tile2])
   *   .then(tiles => console.log(tiles))
   */
  findAll (tiles = []) {
    return new Promise(resolve => {
      this.tables().then(() => {
        // Search all - Not optimized for memory leaks
        if (tiles.length === 0) {
          const query = 'SELECT tile_column, tile_row, zoom_level FROM tiles'
          this.db.all(query, (error, rows) => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(undefined)
            }
            const tiles = rows.map(row => [row.tile_column, row.tile_row, row.zoom_level])
            return resolve(tiles)
          })
        }

        // Searh by defined set of tiles
        const levels = {}
        for (const tile of tiles) {
          const [x, y, z] = tile
          if (levels[z] === undefined) {
            levels[z] = {
              west: x,
              south: y,
              east: x,
              north: y,
              tiles: [],
              index: {}
            }
          }
          if (x < levels[z].west) { levels[z].west = x }
          if (x > levels[z].east) { levels[z].east = x }
          if (y < levels[z].south) { levels[z].south = y }
          if (y > levels[z].north) { levels[z].north = y }
          levels[z].tiles.push(tile)
          levels[z].index[mercator.hash(tile)] = true
        }

        // Execute SQL queries
        const results = []
        this.db.serialize(() => {
          const stmt = this.db.prepare(`
            SELECT tile_column, tile_row, zoom_level
            FROM tiles
            WHERE zoom_level=?
            AND tile_column>=?
            AND tile_column<=?
            AND tile_row>=?
            AND tile_row<=?`)
          for (const [zoom, { west, south, east, north, index }] of entries(levels)) {
            stmt.all([zoom, west, east, south, north], (error, rows) => {
              if (error) {
                utils.warning(error)
                this.errors.push(error)
                this.ok = false
                return resolve(undefined)
              }

              // Remove any extra tiles
              for (const row of rows) {
                const tile = [row.tile_column, row.tile_row, row.zoom_level]
                const hash = mercator.hash(tile)
                if (index[hash]) { results.push(tile) }
              }
            })
          }
          stmt.finalize(() => {
            return resolve(results)
          })
        })
      })
    })
  }

  /**
   * Finds one Tile and returns Buffer
   *
   * @param {Tile} tile Tile [x, y, z]
   * @return {Promise<Buffer>} Tile Data
   * @example
   * mbtiles.findOne([x, y, z])
   *   .then(image => console.log(image))
   */
  findOne (tile) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT tile_data FROM tiles WHERE tile_column=? AND tile_row=? AND zoom_level=?'
      this.db.get(query, tile, (error, row) => {
        if (error) {
          utils.warning(error)
          this.errors.push(error)
          this.ok = false
          return resolve(undefined)
        } else if (row) {
          return resolve(row.tile_data)
        } else {
          utils.warning('<findOne> not found')
          return resolve(undefined)
        }
      })
    })
  }

  /**
   * Build SQL tables
   *
   * @returns {Promise<boolean>}
   * @example
   * mbtiles.tables()
   *   .then(status => console.log(status))
   */
  tables () {
    return new Promise(resolve => {
      if (this._table) { return resolve(true) }
      this.db.serialize(() => {
        this.db.run(schema.TABLE.metadata, error => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(false)
          }
        })
        this.db.run(schema.TABLE.tiles, error => {
          if (error) {
            utils.warning(error)
            this.errors.push(error)
            this.ok = false
            return resolve(false)
          }
          this._table = true
          return resolve(true)
        })
      })
    })
  }

  /**
   * Build SQL index
   *
   * @returns {Promise<boolean>}
   * @example
   * mbtiles.index()
   *   .then(status => console.log(status))
   */
  index () {
    return new Promise(resolve => {
      if (this._index) { return resolve(true) }
      this.tables().then(() => {
        this.db.serialize(() => {
          this.db.run(schema.INDEX.tiles, error => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(false)
            }
          })
          this.db.run(schema.INDEX.metadata, error => {
            if (error) {
              utils.warning(error)
              this.errors.push(error)
              this.ok = false
              return resolve(false)
            }
            this._index = true
            return resolve(true)
          })
        })
      })
    })
  }

  /**
   * Creates hash from a single Tile
   *
   * @param {Tile} tile
   * @return {number} hash
   * @example
   * const hash = mbtiles.hash([5, 25, 30])
   * //=hash
   */
  hash (tile) {
    return mercator.hash(tile)
  }

  /**
   * Creates a hash table for all tiles
   *
   * @param {Tile[]} [tiles] Only find given tiles
   * @return {Promise<Object>} hashes
   */
  hashes (tiles) {
    return new Promise((resolve, reject) => {
      this.findAll(tiles).then(existingTiles => {
        const index = {}
        for (const tile of existingTiles) { index[mercator.hash(tile)] = true }
        if (Object.keys(index).length === 0) { utils.warning('<hashes> is empty') }
        return resolve(index)
      })
    })
  }
}
