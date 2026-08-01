import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addPickedVectorFiles,
  isKmlFileSelection,
  routeKmlFileSelection,
  setKmlFileImportHandler,
  type KmlFileImport,
  type VectorDataSink,
} from "../packages/plugins/src/plugins/maplibre-vector";
import type { GeoLibrePickedVectorFile } from "../packages/plugins/src/types";

function createSink() {
  const calls: Array<{
    name: string;
    companionFiles?: string[];
    sourcePath?: string;
  }> = [];
  const sink = {
    addData: async (
      source: File,
      options?: { companionFiles?: File[]; sourcePath?: string },
    ) => {
      calls.push({
        name: source.name,
        companionFiles: options?.companionFiles?.map((file) => file.name),
        sourcePath: options?.sourcePath,
      });
      return {} as never;
    },
  } as unknown as VectorDataSink;
  return { sink, calls };
}

describe("addPickedVectorFiles", () => {
  it("passes a shapefile's sidecars as companionFiles", async () => {
    const { sink, calls } = createSink();
    const picked: GeoLibrePickedVectorFile[] = [
      {
        file: new File(["shp"], "cities.shp"),
        companionFiles: [
          new File(["shx"], "cities.shx"),
          new File(["dbf"], "cities.dbf"),
        ],
        sourcePath: "/data/cities.shp",
      },
    ];

    await addPickedVectorFiles(sink, picked);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "cities.shp");
    assert.deepEqual(calls[0].companionFiles, ["cities.shx", "cities.dbf"]);
    assert.equal(calls[0].sourcePath, "/data/cities.shp");
  });

  it("omits companionFiles for non-shapefile picks", async () => {
    const { sink, calls } = createSink();

    await addPickedVectorFiles(sink, [
      { file: new File(["x"], "a.geojson"), companionFiles: [] },
      { file: new File(["x"], "b.parquet"), companionFiles: [] },
    ]);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].companionFiles, undefined);
    assert.equal(calls[1].companionFiles, undefined);
  });

  it("loads nothing when the dialog was cancelled (empty list)", async () => {
    const { sink, calls } = createSink();

    await addPickedVectorFiles(sink, []);

    assert.equal(calls.length, 0);
  });
});

// The desktop picker preempts the file input's `change` event, so a KML/KMZ
// pick never reaches the capture listener that routes browser selections. It
// has to consult the same predicate itself or the vector control gets overlay
// documents it cannot read.
describe("routeKmlFileSelection", () => {
  function record() {
    const seen: KmlFileImport[][] = [];
    setKmlFileImportHandler((files) => {
      seen.push(files);
    });
    return seen;
  }

  it("hands a KML/KMZ-only selection to the host importer with its source paths", async () => {
    const seen = record();
    const files: KmlFileImport[] = [
      { file: new File(["x"], "pyramid.kmz"), sourcePath: "/data/pyramid.kmz" },
      { file: new File(["x"], "notes.KML"), sourcePath: "/data/notes.KML" },
    ];

    try {
      assert.equal(await routeKmlFileSelection(files), true);
      assert.deepEqual(
        seen[0].map((entry) => entry.sourcePath),
        ["/data/pyramid.kmz", "/data/notes.KML"],
      );
    } finally {
      setKmlFileImportHandler(null);
    }
  });

  it("leaves a mixed or non-KML selection to the vector control", async () => {
    const seen = record();

    try {
      assert.equal(
        await routeKmlFileSelection([
          { file: new File(["x"], "a.kml") },
          { file: new File(["x"], "b.geojson") },
        ]),
        false,
      );
      assert.equal(await routeKmlFileSelection([{ file: new File(["x"], "b.geojson") }]), false);
      assert.equal(await routeKmlFileSelection([]), false);
      assert.equal(seen.length, 0);
    } finally {
      setKmlFileImportHandler(null);
    }
  });

  it("is a no-op when no host importer is registered", async () => {
    setKmlFileImportHandler(null);

    assert.equal(isKmlFileSelection([{ file: new File(["x"], "a.kmz") }]), true);
    assert.equal(await routeKmlFileSelection([{ file: new File(["x"], "a.kmz") }]), false);
  });
});
