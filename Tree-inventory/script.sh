SOURCE=tree-inventory-closest-building

# Zoom 12
tippecanoe \
    --layer=$SOURCE \
    --output=$SOURCE-z12.mbtiles \
    --force \
    --minimum-zoom 12 \
    --maximum-zoom 12 \
    --full-detail 20 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Zoom 13
tippecanoe \
    --layer=$SOURCE \
    --output=$SOURCE-z13.mbtiles \
    --force \
    --minimum-zoom 13 \
    --maximum-zoom 13 \
    --full-detail 19 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Zoom 14
tippecanoe \
    --layer=$SOURCE \
    --output=$SOURCE-z14.mbtiles \
    --force \
    --minimum-zoom 14 \
    --maximum-zoom 14 \
    --full-detail 18 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Merge SQLite together
sqlite3 $SOURCE-z12.mbtiles '.dump' > tmp &&
    sqlite3 $SOURCE-z13.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE-z14.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE.mbtiles < 'tmp'
rm $SOURCE-z12.mbtiles $SOURCE-z13.mbtiles $SOURCE-z14.mbtiles tmp
