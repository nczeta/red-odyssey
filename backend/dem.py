from dataclasses import dataclass
import numpy as np, rasterio

@dataclass
class DEM:
    z: np.ma.MaskedArray
    transform: object
    res: tuple
    crs: object

def load_dem(path) -> DEM:
    with rasterio.open(path) as src:
        return DEM(src.read(1, masked=True), src.transform, src.res, src.crs)