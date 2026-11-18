# Fotoshi photos on OSM objects

`node update.js` asks [Fotoshi](https://fotoshi.com/developers/api) for the photographed objects in Ottawa and Gatineau and writes `fotoshi-<date>-01.osm`, `-02.osm` and so on to review and upload from JOSM. It needs Node 18+ and no packages.

Each file has at most 50 objects (`--chunk <n>` changes this) in one compact area, and the files are numbered roughly north to south. A second run on the same day goes on numbering after the first.

- An OSM object Fotoshi links new photos to gets `image:fotoshi` with their ids: up to 5, newest first, separated by `;`. It keeps its version, so JOSM reports a conflict if someone edited it since.
- A photographed object that Fotoshi has no OSM object for, or whose object was deleted or has no tags, becomes a new node at Fotoshi's point with `fixme=find an object` and `image:fotoshi`. For a building or a road, that point is somewhere on it.
- Left alone: objects that already have `image:fotoshi`, and objects with a photo already anywhere in OSM.

## Setup

Copy `.env.example` to `.env` and put your key in `FOTOSHI_API_KEY` (fotoshi.com/developers, API keys). Git ignores `.env`. `FOTOSHI_USER`, or `--user <name>`, limits the run to one contributor's photos.

## processed.json

Every photo looked at and what became of it. Reruns skip these photos, so they write only new ones; `--again` looks at all of them again. Commit it with the .osm files.

A free key allows 1,000 photos and objects a day. A full run costs one for each object and one for each photo: in November 2026 there were 411 photos in the area. A run that runs out writes what it got and keeps its place in `resume`, and the next run goes on from there.

`fotoshi-<date>.json` is what Fotoshi returned (git ignores it). If OSM can't be reached, rerun with `--from fotoshi-<date>.json` rather than asking Fotoshi again.

## Reviewing in JOSM

1. Open the file. The objects that only got `image:fotoshi` are ready.
2. Search `fixme="find an object"`. For each node:
   - open its photo at `https://fotoshi.com/photo/<id>` (the console lists them) and download the area;
   - copy `image:fotoshi` onto the object in the photo, then delete the node;
   - delete the node too if nothing fits.
3. Before uploading, search `fixme="find an object"` again: none should be left. Fotoshi appreciates `source=Fotoshi` on the changeset.

## JOSM plugin

To see the photos while reviewing, install [josm-fotoshi](https://github.com/YaroShkvorets/josm-fotoshi). Its Fotoshi panel shows the photos in the selected object's `image:fotoshi` tag.

## Fotoshi's terms

Fotoshi lets anyone take map data from its photos into OSM. Its [Data License](https://fotoshi.com/license) and [Terms](https://fotoshi.com/terms) (section 7) say this does not cover "bulk copying of Fotoshi databases or place links", and the free developer preview doesn't allow bulk harvesting. Ask Fotoshi before uploading links to other people's photos. Your own photos (`--user`) are your contributions under its terms.
