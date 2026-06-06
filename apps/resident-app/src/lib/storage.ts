const HOME_KEY = 'resident-app.home-building';

export function getHomeBuilding(): { id: string; address: string; district: string } | null {
  const raw = localStorage.getItem(HOME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setHomeBuilding(building: { id: string; address: string; district: string }): void {
  localStorage.setItem(HOME_KEY, JSON.stringify(building));
}

export function clearHomeBuilding(): void {
  localStorage.removeItem(HOME_KEY);
}
