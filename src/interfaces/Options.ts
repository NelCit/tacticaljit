export default interface Options {
  displayPnj: boolean;
  /**
   * Whether to display the start cells of the map.
   */
  displayStartCells: boolean;
  /**
   * Whether to add a watermark to the image.
   */
  addWatermark: boolean;
  /**
   * The path of the assets
   * If is a clone, it should be "./assets"
   * If it's installed as a package, it should be "./node_modules/tacticalmaprenderer/assets"
   */
  assetPath: string;
  /**
   * Whether to display the cell IDs on the map.
   */
  displayCellId: boolean;
}