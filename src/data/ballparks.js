/**
 * Authentic Earl Weaver Baseball Ballpark Schema & Historical Parks
 * Based on EWB 1.0 (1987) & Commissioner's Disk park editor specifications:
 * - 10 Fence Distances (ft): Left Pole, Left 2, L-C 1, L-C 2, Center 1, Center 2, R-C 1, R-C 2, Right 2, Right Pole
 * - 9 Fence Heights (ft): Left 1, Left 2, Left 3, Center 1, Center 2, Center 3, Right 1, Right 2, Right 3
 * - Surface: 'Grass' | 'Artificial Turf'
 * - Environment: 'Outdoor' | 'Indoor'
 * - Wind direction, probability, and average mph
 */

export const BALLPARKS = {
  fenway: {
    id: 'fenway',
    name: 'Fenway Park',
    city: 'Boston',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Left to Right',
    windPct: 65,
    avgWindMph: 11,
    foulGrounds: 'Small',
    wallColor: '#144d29', // Green Monster green
    wallAccent: '#e6edf3',
    // 10-point distance array from Left Pole (-45 deg) to Right Pole (+45 deg)
    fenceDistances: [
      310, // Left Pole (Green Monster)
      315, // Left 2
      345, // L-C 1
      379, // L-C 2
      390, // Center 1
      420, // Center 2 (Deep Triangle)
      380, // R-C 1
      375, // R-C 2
      340, // Right 2
      302  // Right Pole (Pesky's Pole)
    ],
    // 9-segment wall heights (ft) from Left to Right
    fenceHeights: [
      37, 37, 37, // Left 1..3 (The Green Monster)
      17, 17, 17, // Center 1..3
      7,  5,  5   // Right 1..3 (Bullpen short wall)
    ],
    description: 'Short 310 ft left-field line guarded by the 37-foot Green Monster turns lofted fly balls into wall-ball singles and doubles.'
  },

  memorial: {
    id: 'memorial',
    name: 'Memorial Stadium',
    city: 'Baltimore',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Left to Right',
    windPct: 50,
    avgWindMph: 8,
    foulGrounds: 'Large',
    wallColor: '#1c3b6e', // Orioles classic blue/green hedge fence
    wallAccent: '#f58220',
    fenceDistances: [
      309, // Left Pole
      335, // Left 2
      365, // L-C 1
      380, // L-C 2
      400, // Center 1
      400, // Center 2
      380, // R-C 1
      365, // R-C 2
      335, // Right 2
      309  // Right Pole
    ],
    fenceHeights: [
      14, 14, 7,
      7,  7,  7,
      7,  14, 14
    ],
    description: "Earl Weaver's home park on 33rd Street. Symmetrical 309 ft corners with generous foul territory that favors strong pitching and defense."
  },

  wrigley: {
    id: 'wrigley',
    name: 'Wrigley Field',
    city: 'Chicago',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'In from Center',
    windPct: 75,
    avgWindMph: 14,
    foulGrounds: 'Small',
    wallColor: '#254c23', // Ivy brick wall
    wallAccent: '#d99b66',
    fenceDistances: [
      355, // Left Pole
      360, // Left 2
      368, // L-C 1
      375, // L-C 2
      400, // Center 1
      400, // Center 2
      375, // R-C 1
      368, // R-C 2
      360, // Right 2
      353  // Right Pole
    ],
    fenceHeights: [
      11, 11, 11,
      11, 11, 11,
      11, 11, 11
    ],
    description: 'Deep 355 ft foul poles, ivy-covered 11.5 ft brick walls, and strong Lake Michigan winds that dramatically alter fly ball carry.'
  },

  metrodome: {
    id: 'metrodome',
    name: 'H.H.H. Metrodome',
    city: 'Minnesota',
    surface: 'Artificial Turf',
    environment: 'Indoor',
    prevailingWind: 'None',
    windPct: 0,
    avgWindMph: 0,
    foulGrounds: 'Small',
    wallColor: '#1d428a', // Blue Teflon bag wall
    wallAccent: '#ffffff',
    fenceDistances: [
      343, // Left Pole
      358, // Left 2
      375, // L-C 1
      385, // L-C 2
      408, // Center 1
      408, // Center 2
      385, // R-C 1
      367, // R-C 2
      345, // Right 2
      327  // Right Pole
    ],
    fenceHeights: [
      13, 13, 7,
      7,  7,  7,
      23, 23, 23 // The 23-foot Right Field "Hefty Bag"
    ],
    description: 'Fast Artificial Turf rockets grounders through the infield and produces high bounces, while the 23-ft right-field bag blocks cheap homers.'
  },

  anaheim: {
    id: 'anaheim',
    name: 'Anaheim Stadium',
    city: 'Anaheim',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Out to Center',
    windPct: 45,
    avgWindMph: 7,
    foulGrounds: 'Medium',
    wallColor: '#003263', // Angels navy blue
    wallAccent: '#ba0021', // Angels red
    fenceDistances: [
      333, // Left Pole
      350, // Left 2
      375, // L-C 1
      386, // L-C 2
      404, // Center 1
      404, // Center 2
      386, // R-C 1
      375, // R-C 2
      350, // Right 2
      333  // Right Pole
    ],
    fenceHeights: [
      8, 8, 8,
      8, 8, 8,
      8, 8, 8
    ],
    description: 'Home of the 1982 AL West Champion California Angels ("The Big A"). Features symmetrical 333 ft foul poles and gentle Pacific evening breezes.'
  },

  fulton: {
    id: 'fulton',
    name: 'Atlanta-Fulton County Stadium',
    city: 'Atlanta',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Out to Right-Center',
    windPct: 60,
    avgWindMph: 9,
    foulGrounds: 'Small',
    wallColor: '#12284c', // Braves navy
    wallAccent: '#ba0c2f', // Braves scarlet
    fenceDistances: [
      330, // Left Pole
      345, // Left 2
      375, // L-C 1
      385, // L-C 2
      402, // Center 1
      402, // Center 2
      385, // R-C 1
      375, // R-C 2
      345, // Right 2
      330  // Right Pole
    ],
    fenceHeights: [
      9, 9, 9,
      9, 9, 9,
      9, 9, 9
    ],
    description: 'Famed as "The Launching Pad" due to its 1,050-foot elevation above sea level, producing extra carry for fly balls hit to all fields.'
  }
};

/**
 * Interpolates fence distance and fence height for any spray angle
 * sprayAngleDeg: -45 (Left Field Foul Pole) to +45 (Right Field Foul Pole)
 */
export function getWallAtAngle(park, sprayAngleDeg) {
  const clamped = Math.max(-45, Math.min(45, sprayAngleDeg));
  const norm = (clamped + 45) / 90; // 0.0 (LF) to 1.0 (RF)

  // Interpolate 10 fence distances (indices 0..9)
  const dIdxFloat = norm * 9;
  const dIdxLow = Math.floor(dIdxFloat);
  const dIdxHigh = Math.min(9, dIdxLow + 1);
  const dFrac = dIdxFloat - dIdxLow;
  const distanceFt =
    park.fenceDistances[dIdxLow] * (1 - dFrac) +
    park.fenceDistances[dIdxHigh] * dFrac;

  // Map to 9 fence height segments (indices 0..8)
  const hIdx = Math.min(8, Math.floor(norm * 9));
  const heightFt = park.fenceHeights[hIdx];

  return {
    distanceFt: Math.round(distanceFt * 10) / 10,
    heightFt,
    segmentIndex: hIdx
  };
}
