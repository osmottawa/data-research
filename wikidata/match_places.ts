/// <reference path="./wikidata-sdk/index.d.ts" />
import * as wdk from 'wikidata-sdk'
import * as axios from 'axios'

const url = wdk.searchEntities('Ottawa')
//const url = wdk.getEntities('Q3046584')

axios.get(url)
  .then(request => console.log(JSON.stringify(request.data, null, 4)))
