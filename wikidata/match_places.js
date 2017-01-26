"use strict";
/// <reference path="./wikidata-sdk/index.d.ts" />
const wdk = require("wikidata-sdk");
const axios = require("axios");
const url = wdk.searchEntities('Ottawa');
//const url = wdk.getEntities('Q3046584')
axios.get(url)
    .then(request => console.log(JSON.stringify(request.data, null, 4)));
