import numpy as np
from skimage.graph import route_through_array
import matplotlib.pyplot as plt

from backend.dem import load_dem


dem = load_dem("../assets/M20_JezeroCrater_CTXDEM_20m.tif") # load the dem from the file

MAX_SLOPE = 20.0
"""
maximum slope before being considered dangerous for the human to 
be explored, in degrees
"""

K = 5
"""
K is how many times more expensive a step on the steepest allowed slope is compared 
to a step on flat ground. In practice, the rover is willing to take a 
path up to about K times longer to avoid climbing the steepest terrain it’s 
allowed to cross.
"""

T0 = np.atan(np.tan(MAX_SLOPE) / np.sqrt(K - 1))
"""
T0 is computed based on the value of K chosen
"""


"""
function that analyzes all the dem and calculates the slope for every pixel
"""
def compute_slope(dem):
    z = dem.z.astype("float32").filled(np.nan)  # replace every non-valid point with NaN
    zp = np.pad(z, 1, mode="edge") # adds an extra border around the matrix

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
    # 1. calculate the variation of height in relation to the variation of x and y
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dem.res[0])
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dem.res[1])

    # 2. calculate the tan of the angle
    g = np.hypot(dzdx, dzdy) # tan of the slope of every pixel of the map

    return g

"""
function that returns a boolean map of where the path is allowed to go
False = dangerous pixel, angle > the maximum safe angle
"""
def get_valid_map(slope):
    return np.isfinite(slope) & (slope <= np.tan(np.radians(MAX_SLOPE)))

"""
function that calculates the mult for every pixel, used in the pathfinding algorithm
"""
def compute_mult(g, t0):
    mult = 1 + (g/np.tan(np.radians(t0)))**2 # formula that decides how much a steep slope penalizes the next pixel
    mult[~valid_map] = np.inf
    return mult

"""
the real pathfinding algorithm, using skimage
"""
def find_path(g, t0, dem, valid_map, start, target):
    if not (valid_map[start] and valid_map[target]):
        return None, None

    mult = compute_mult(g, t0)
    path, length = route_through_array(mult, start, target, fully_connected=True, geometric=True)
    # fully connected = considerate diagonal pixels
    # geometric = a diagonal pixel is multiplied by sqrt(2), being more distant

    return path, length * dem.res[0]

if __name__ == "__main__":
    # calculate the slope
    g = compute_slope(dem)

    # get the valid map
    valid_map = get_valid_map(g)
    # check how much of the map is explorable
    print(np.count_nonzero(valid_map)/valid_map.size)

    # compute the path
    path, length = find_path(g, T0, dem, valid_map, (100, 100), (4000, 4000))
    print(path, length)

    # displays the map
    plt.imshow(valid_map)
    # displays the path
    rows, cols = zip(*path)
    plt.plot(cols, rows, "r", linewidth=1)
    # show the graph
    plt.show()
