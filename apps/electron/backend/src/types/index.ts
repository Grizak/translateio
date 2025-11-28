export interface StoreSchema {
  mainWindow: {
    bounds: {
      width: number;
      height: number;
      x?: number;
      y?: number;
    };
  };
}
