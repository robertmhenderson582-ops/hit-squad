let locked = false;

export function setDeskLocked(on: boolean) {
  locked = on;
}

export function isDeskLocked() {
  return locked;
}
