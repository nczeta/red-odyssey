import numpy as np
from skimage.graph import route_through_array
import matplotlib.pyplot as plt
from itertools import permutations
import math
from pathlib import Path

from backend.dem import load_dem

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


def segment_cost(a, b, mult, res):
    """
    caluclates the cost of the rect line that connects two points
    returns np.inf if it goes across non-valid areas
    """

    rows, cols = mult.shape

    def valid(r, c):
        return 0 <= r < rows and 0 <= c < cols and np.isfinite(mult[r, c]) and mult[r, c] >= 1

    r, c = a
    end_r, end_c = b

    if not valid(r, c) or not valid(end_r, end_c):
        return math.inf

    dr = end_r - r
    dc = end_c - c

    if dr == 0 and dc == 0:
        return 0.0

    length = math.hypot(dr, dc) * res

    # Verso di attraversamento della griglia
    sr = 1 if dr > 0 else -1 if dr < 0 else 0
    sc = 1 if dc > 0 else -1 if dc < 0 else 0

    # Parametri per attraversare le celle
    delta_r = 1 / abs(dr) if dr else math.inf
    delta_c = 1 / abs(dc) if dc else math.inf

    next_r = delta_r / 2
    next_c = delta_c / 2

    t = 0.0
    total_cost = 0.0

    while t < 1:

        # Prossimo bordo attraversato
        next_t = min(next_r, next_c, 1.0)

        # Lunghezza percorsa nella cella corrente
        distance = (next_t - t) * length

        total_cost += distance * float(mult[r, c])

        if next_t >= 1.0 - 1e-12:
            break

        # Attraversamento esatto di un angolo
        if abs(next_r - next_c) < 1e-12:

            # Evitiamo di tagliare angoli bloccati
            if not valid(r + sr, c):
                return math.inf

            if not valid(r, c + sc):
                return math.inf

            r += sr
            c += sc

            next_r += delta_r
            next_c += delta_c

        elif next_r < next_c:
            r += sr
            next_r += delta_r

        else:
            c += sc
            next_c += delta_c

        if not valid(r, c):
            return math.inf

        t = next_t

    return total_cost


def smooth_path(path, mult, res, max_lookahead=48):
    """
    Semplifica un percorso cercando collegamenti
    diretti tra punti non consecutivi.

    Accetta una scorciatoia soltanto se il costo
    non aumenta.
    """

    path = [tuple(p) for p in path]

    if len(path) < 2:
        return path

    if max_lookahead < 1:
        raise ValueError("max_lookahead deve essere >= 1")

    # Costi cumulativi del percorso originale
    prefix = [0.0]

    for a, b in zip(path, path[1:]):
        d = math.dist(a, b) * res
        penalty = (float(mult[a]) + float(mult[b])) / 2

        prefix.append(prefix[-1] + d * penalty)

    smoothed = [path[0]]

    i = 0

    while i < len(path) - 1:

        best = i + 1

        limit = min(
            i + max_lookahead,
            len(path) - 1
        )

        # Prova prima il punto più lontano
        for j in range(limit, i, -1):

            shortcut_cost = segment_cost(
                path[i], path[j], mult, res
            )

            original_cost = prefix[j] - prefix[i]

            tolerance = 1e-8 * max(1, original_cost)

            if shortcut_cost <= original_cost + tolerance:
                best = j
                break

        # Anche un passo originale deve essere valido
        if not math.isfinite(
                segment_cost(path[i], path[best], mult, res)
        ):
            raise ValueError("Il percorso attraversa un angolo bloccato")

        smoothed.append(path[best])
        i = best

    return smoothed


if __name__ == "__main__":
    # get the dem from the geotiff image
    dem = load_dem(Path(__file__).resolve().parents[1] / "assets/M20_JezeroCrater_CTXDEM_20m.tif")

    # compute the gradient of the whole dem
    g = compute_slope(dem)

    # get the valid map
    valid_map = get_valid_map(g)

    # get the mult of the entire dem
    mult = compute_mult(g, valid_map, G0)

    # test waypoints
    points = [
        (200, 200),
        (4000, 4000),
        (300, 1300),
        (2400, 4000)
    ]

    # reorder the points
    points = reorder_points(valid_map, points)

    # get the original paths
    paths, costs = find_path(points, mult, dem.res[0])

    # apply the smoothing
    smoothed_paths = []
    for path in paths:
        smoothed = smooth_path(path, mult, dem.res[0], max_lookahead=48)
        smoothed_paths.append(smoothed)

    # compare the pixelated path and the smoothed out one
    for i, (original, smoothed) in enumerate(zip(paths, smoothed_paths)):
        old_distance = sum(math.dist(a, b) * dem.res[0] for a, b in zip(original, original[1:]))

        new_distance = sum(math.dist(a, b) * dem.res[0] for a, b in zip(smoothed, smoothed[1:]))

        new_cost = sum(segment_cost(a, b, mult, dem.res[0]) for a, b in zip(smoothed, smoothed[1:]))

        print(f"\nPath {i + 1}")
        print(f"Original distance: {old_distance:.2f} m")
        print(f"Smoothed distance: {new_distance:.2f} m")
        print(f"Original cost: {costs[i]:.2f}")
        print(f"Smoothed cost: {new_cost:.2f}")

    # plotting the info
    # 1. show the gradient
    plt.imshow(np.degrees(np.arctan(g)), cmap="terrain")

    # 2. original path
    for i, path in enumerate(paths):
        rows, cols = zip(*path)
        plt.plot(cols, rows, color="red", linewidth=2, label="Original" if i == 0 else None)

    # 3. smoothed path
    for i, path in enumerate(smoothed_paths):
        rows, cols = zip(*path)
        plt.plot(cols, rows, color="white", linewidth=1, label="Smoothed" if i == 0 else None)

    # 4. waypoints
    rows, cols = zip(*points)
    plt.scatter(cols, rows, color="yellow", s=30, zorder=3, label="Waypoints")

    # 5. show the graph
    plt.title("Original path vs smoothed path")
    plt.legend()
    plt.show()
