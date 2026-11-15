import numpy as np
from skimage.graph import route_through_array
import matplotlib.pyplot as plt
from itertools import permutations

from backend.dem import load_dem

dem = load_dem("../assets/M20_JezeroCrater_CTXDEM_20m.tif")  # load the dem from the file

MAX_SLOPE = 20.0
G_MAX = np.tan(np.radians(MAX_SLOPE))  # max tan
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

G0 = G_MAX / np.sqrt(K - 1)
"""
G0 is computed based on the value of K chosen
"""


def compute_slope(dem):
    """
    function that analyzes all the dem and calculates the slope for every pixel
    """
    z = dem.z.astype("float32").filled(np.nan)  # replace every non-valid point with NaN
    zp = np.pad(z, 1, mode="edge")  # adds an extra border around the matrix

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
    grad = np.hypot(dzdx, dzdy)  # tan of the slope of every pixel of the map

    return grad


def get_valid_map(g):
    """
    function that returns a boolean map of where the path is allowed to go
    False = dangerous pixel, angle > the maximum safe angle
    """
    return np.isfinite(g) & (g <= G_MAX)


def reorder_points(valid_map, point_array):
    """
    function to reorder the middle points of the path for the most efficiency
    """
    for point in point_array:
        if not valid_map[point]:
            raise ValueError(f"Point {point} is not reachable")

    n = len(point_array)

    d = np.zeros((n, n))
    for i, a in enumerate(point_array):
        for j, b in enumerate(point_array):
            d[i][j] = np.hypot(a[0] - b[0], a[1] - b[1])

    best = (np.inf, ())
    for perm in permutations(range(1, n - 1)):
        order = (0, *perm, n - 1)
        point_couples = zip(order, order[1:])

        total = 0.0
        for a, b in point_couples:
            total += d[a][b]

        if total < best[0]:
            best = (total, order)

    return [point_array[i] for i in best[1]]


def compute_mult(g, valid_map, g0):
    """
    function that calculates the mult for every pixel, used in the pathfinding algorithm
    """

    mult = 1 + (g / g0) ** 2  # formula that decides how much a steep slope penalizes the next pixel
    mult[~valid_map] = np.inf
    return mult


def find_path(point_array, mult, res):
    """
    This function computes the path that reaches multiple points, in the order they are given
    """
    for point in point_array:
        r, c = point
        if not np.isfinite(mult[r, c]):
            raise ValueError(f"Point {point} is not reachable")

    paths: list[list[tuple]] = []
    costs: list = []
    for start, end in zip(point_array, point_array[1:]):
        path, cost = route_through_array(
            array=mult, start=start, end=end,
            fully_connected=True, geometric=True
        )
        paths.append(path)
        costs.append(cost * res)

    return paths, costs


def max_slope_on_path(g, paths):
    """
    function to compute the maximum slope encountered in a path
    """
    cells = [cell for path in paths for cell in path]
    rows, cols = zip(*cells)
    return np.degrees(np.arctan(g[rows, cols].max()))


if __name__ == "__main__":
    # calculate the slope
    g = compute_slope(dem)

    # get the valid map
    valid_map = get_valid_map(g)
    # check how much of the map is explorable
    print(np.count_nonzero(valid_map) / valid_map.size)

    # compute the path
    points = [(200, 200), (4000, 4000), (300, 1300), (2400, 4000)]
    points = reorder_points(valid_map, points)

    mult = compute_mult(g, valid_map, G0)
    paths, costs = find_path(points, mult, dem.res[0])
    print(max_slope_on_path(g, paths))

    # displays the map
    plt.imshow(np.degrees(np.arctan(g)))
    # displays the path (one line per segment)
    for path in paths:
        rows, cols = zip(*path)
        plt.plot(cols, rows, "r", linewidth=1)

    # displays the waypoints (once, all together)
    rows, cols = zip(*points)
    plt.scatter(cols, rows, c="red", s=10, zorder=3)
    # show the graph
    plt.show()
