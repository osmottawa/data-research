const {featureEach} = require('@turf/meta')

module.exports = (data, tile, writeData, done) => {
  const features = []
  const images = data.mapillary['mapillary-images']
  const sequences = data.mapillary['mapillary-sequences']

  featureEach(images, image => features.push(image))
  featureEach(sequences, sequence => features.push(sequence))
  done(null, features)
}
