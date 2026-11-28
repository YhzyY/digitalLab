'use strict';

// Image columns increase eastwards (+X); image rows increase southwards (+Z).
globalThis.citySurveyMap = (() => {
  const extent = {minX: -175, maxX: 164, minZ: -120, maxZ: 120};
  const roadsX = [-167, -88, -8, 73, 155];
  const roadsZ = [-110, -39, 39, 110];
  const leftBank = z => 22 + 6.1 * Math.sin(z * .041) + 1.45 * Math.sin(z * .078);
  const rightBank = z => 56 + 5.1 * Math.sin(z * .04 + .64) + 1.55 * Math.sin(z * .073);
  function bankProfile(z) {
    const crest = 1.75 - 1.43 * Math.max(0, 1 - ((z - 4) / 34) ** 2);
    const left = leftBank(z), right = rightBank(z);
    return [[10, .04], [left - 3, 1.5], [left + 1, -1.8], [right - 1, -1.8],
      [right + 3, crest], [65.5, .10], [72, .04]];
  }
  const lake = { x: -46, z: 1, rx: 15.1, rz: 11, level: .565 };
  const shoreShape = angle => 1 + .07 * Math.cos(3 * angle) + .055 * Math.sin(2 * angle);
  const parcels = roadsX.slice(0, -1).flatMap((west, i) =>
    roadsZ.slice(0, -1).map((north, j) => ({
      i, j, park: i === 1 && j === 1,
      x: (west + roadsX[i + 1]) / 2, z: (north + roadsZ[j + 1]) / 2,
      w: roadsX[i + 1] - west - 16, d: roadsZ[j + 1] - north - 16,
    }))
  ).filter(({i}) => i !== 2);

  function groundElevation(x, z) {
    const vertical = roadsX.some(road => Math.abs(x - road) <= 5.3);
    const horizontal = (x <= 1 || x >= 71) && roadsZ.some(road => Math.abs(z - road) <= 5.3);
    const roadSurface = vertical && horizontal ? .352 : horizontal ? .34 : vertical ? .31 : -Infinity;
    const profile = bankProfile(z);
    // Use the highest surface where the narrow return slope overlaps the crest.
    if (x >= profile[0][0] && x < 72) {
      let height = -Infinity;
      for (let i = 1; i < profile.length; i++) {
        const [a, low] = profile[i - 1], [b, high] = profile[i];
        if (x < Math.min(a, b) || x > Math.max(a, b)) continue;
        height = Math.max(height, a === b ? Math.max(low, high) : low + (high - low) * (x - a) / (b - a));
      }
      if (Number.isFinite(height)) return Math.max(height, roadSurface);
    }
    const dx = (x - lake.x) / lake.rx, dz = (z - lake.z) / lake.rz;
    if (Math.hypot(dx, dz) <= shoreShape(Math.atan2(dz, dx))) return lake.level;
    if (Math.abs(x + 48) <= 30 && Math.abs(z) <= 29.5) return .505;
    if (Math.abs(x + 48) <= 31.5 && Math.abs(z) <= 31) return .405;
    for (const parcel of parcels) {
      if (parcel.park) continue;
      const dx = Math.abs(x - parcel.x), dz = Math.abs(z - parcel.z);
      if (dx <= parcel.w / 2 - 1 && dz <= parcel.d / 2 - 1) return .44;
      if (dx <= parcel.w / 2 && dz <= parcel.d / 2) return .31;
    }
    if (Number.isFinite(roadSurface)) return roadSurface;
    if (roadsX.some(road => Math.abs(x - road) <= 7.5)) return .22;
    if (roadsZ.some(road => Math.abs(z - road) <= 7.2 && (x <= 1 || x >= 71))) return .26;
    return .04;
  }
  const required = {minX: -98, maxX: 75, minZ: -40, maxZ: 48};
  const presets = {
    river: {minX: -100, maxX: 112, minZ: -48, maxZ: 64},
    block: {...extent},
  };
  function valid(bounds) {
    return !!bounds && Object.keys(extent).every(key => Number.isFinite(bounds[key])) &&
      bounds.minX >= extent.minX && bounds.maxX <= extent.maxX &&
      bounds.minZ >= extent.minZ && bounds.maxZ <= extent.maxZ &&
      bounds.minX <= required.minX && bounds.maxX >= required.maxX &&
      bounds.minZ <= required.minZ && bounds.maxZ >= required.maxZ;
  }
  function imageCrop(bounds, pixelWidth, pixelHeight) {
    const area = valid(bounds) ? bounds : extent;
    const sx = pixelWidth / (extent.maxX - extent.minX);
    const sy = pixelHeight / (extent.maxZ - extent.minZ);
    const x = (area.minX - extent.minX) * sx;
    const y = (area.minZ - extent.minZ) * sy;
    return {x, y, width:(area.maxX - area.minX) * sx, height:(area.maxZ - area.minZ) * sy};
  }
  return {extent, presets, required, roadsX, roadsZ, leftBank, rightBank, bankProfile, parcels, lake, shoreShape, groundElevation, imageCrop, valid};
})();
