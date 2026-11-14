from backend.dem import load_dem
import numpy as np

dem = load_dem("../assets/M20_JezeroCrater_CTXDEM_20m.tif")
dem.z = dem.z.astype("float32").filled(np.nan)

def compute_slope(dem):
    zp = np.pad(dem.z, 1, mode="edge") # adds an extra border around the matrix

    # get every neighbor at the same time
    a = zp[:-2, :-2]
    b = zp[:-2, 1:-1]
    c = zp[:-2, 2:]
    d = zp[1:-1, :-2]
    f = zp[1:-1, 2:]
    g = zp[2:, :-2]
    h = zp[2:, 1:-1]
    i = zp[2:, 2:]

    # calculate the slope using Horn's formula
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dem.res[0])
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dem.res[1])
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))

    return slope


