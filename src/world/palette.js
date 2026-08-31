import * as THREE from 'three';

// One palette, shared by every shader in the world, so the whole journey
// reads as a single continuous environment.
export const PAL = {
  void:     new THREE.Color('#04060b'),
  fog:      new THREE.Color('#060c18'),
  fogFar:   new THREE.Color('#102444'),
  deep:     new THREE.Color('#080f1c'),
  navy:     new THREE.Color('#101f38'),
  steel:    new THREE.Color('#1e3557'),
  rim:      new THREE.Color('#4a80bd'),
  edge:     new THREE.Color('#31659c'),
  gold:     new THREE.Color('#f0b642'),
  goldHi:   new THREE.Color('#ffe0a0'),
  goldDeep: new THREE.Color('#6d4711'),
  red:      new THREE.Color('#ff5f52'),
};
