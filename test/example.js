const path = require('path')
const MBTiles = require('../')

// const mbtiles = new MBTiles('./in/corrupt.mbtiles')
const mbtiles = new MBTiles(path.join(__dirname,  'in', 'geocoder_data.mbtiles'))
// const utils = ('./utils')
// mbtiles.metadata().then(data => console.log(data))
// mbtiles.findOne([1, 2, 2]).then(data => fs.writeFileSync('tile.png', data))
// mbtiles.hashes().then(index => console.log(index))
// mbtiles.hashes([[0, 0, 0], [0, 0, 1], [1, 1, 1], [0, 2, 2]]).then(data => console.log(data))
// mbtiles.findAll().then(data => console.log(data))
// mbtiles.minZoom().then(minZoom => console.log(minZoom))
// mbtiles.maxZoom().then(maxZoom => console.log(maxZoom))
// mbtiles.format().then(format => console.log(format))
// mbtiles.bounds(1).then(bounds => console.log(bounds))

// mbtiles.update({bounds: [[-20, -30, 20, 30], [-110, -30, 120, 80]]}).then(metadata => console.log(metadata))
mbtiles.metadata().then(metadata => {
  console.log(metadata)
  mbtiles.getMaxZoom().then(maxzoom => console.log(maxzoom))
})
// mbtiles.update()
// mbtiles.validate()
