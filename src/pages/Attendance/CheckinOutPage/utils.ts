export const deg2rad = (deg: number) => {
  return deg * (Math.PI / 180);
};

export const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in m
};

export const isPointInPolygon = (point: { lat: number; lng: number }, vs: { lat: number; lng: number }[]) => {
  const x = point.lat, y = point.lng;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lat, yi = vs[i].lng;
    const xj = vs[j].lat, yj = vs[j].lng;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const getStatusKey = (status: string) => {
  switch (status) {
    case 'มา': return 'present';
    case 'สาย': return 'late';
    case 'ลา': return 'leave';
    case 'ขาด': return 'absent';
    case 'กลับก่อน': return 'early';
    case 'ไม่ลงเวลาออก': return 'noCheckout';
    default: return null;
  }
};