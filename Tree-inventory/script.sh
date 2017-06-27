SOURCE=tree-inventory

# Zoom 12
tippecanoe \
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

# Zoom 15
tippecanoe \
    --output=$SOURCE-z15.mbtiles \
    --force \
    --minimum-zoom 15 \
    --maximum-zoom 15 \
    --full-detail 17 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Zoom 16
tippecanoe \
    --output=$SOURCE-z16.mbtiles \
    --force \
    --minimum-zoom 16 \
    --maximum-zoom 16 \
    --full-detail 16 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Zoom 17
tippecanoe \
    --output=$SOURCE-z17.mbtiles \
    --force \
    --minimum-zoom 17 \
    --maximum-zoom 17 \
    --full-detail 15 \
    --no-line-simplification \
    --no-feature-limit \
    --no-tile-size-limit \
    --no-polygon-splitting \
    --no-clipping \
    --no-duplication \
    $SOURCE.geojson

# Merge SQLite together
sqlite3 $SOURCE-z13.mbtiles '.dump' > tmp &&
    sqlite3 $SOURCE-z12.mbtiles '.dump' > tmp &&
    sqlite3 $SOURCE-z14.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE-z15.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE-z16.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE-z17.mbtiles '.dump' >> tmp &&
    sqlite3 $SOURCE.mbtiles < 'tmp'
rm $SOURCE-z12.mbtiles $SOURCE-z13.mbtiles $SOURCE-z14.mbtiles $SOURCE-z15.mbtiles $SOURCE-z16.mbtiles $SOURCE-z17.mbtiles tmp