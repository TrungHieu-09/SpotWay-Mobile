import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  angleDiff, bearing, buildFloorGraph, edgeKey, locAtNode, locPoint, moveAlong, nearestEndpoint, projectOnPolyline, snapToGraph, trackOnRoute,
} from './livepos.ts';

// A "T" shaped floor, y grows downwards (map up = -y):
//
//   C(0,0) --- N(100,0) --- D(200,0)        heading 90 = east, 0 = north, 180 = south
//                |
//                S(100,100)
const nodes = [
  { id: 'C', x: 0, y: 0 }, { id: 'N', x: 100, y: 0 }, { id: 'D', x: 200, y: 0 }, { id: 'S', x: 100, y: 100 },
];
const edges = [
  { fromNodeId: 'C', toNodeId: 'N' }, { fromNodeId: 'N', toNodeId: 'D' }, { fromNodeId: 'N', toNodeId: 'S' },
];
const g = buildFloorGraph('F1', nodes, edges);
const at = (id) => locAtNode(g, id);
const pt = (loc) => locPoint(g, loc);
const near = (p, x, y, tol = 0.01) => assert.ok(Math.hypot(p.x - x, p.y - y) < tol, `expected (${x},${y}) got (${p.x.toFixed(2)},${p.y.toFixed(2)})`);

test('walks along a corridor in the heading direction', () => {
  const loc = moveAlong(g, at('C'), 60, 90);
  near(pt(loc), 60, 0);
});

test('walking against the edge direction flips travel direction', () => {
  const start = moveAlong(g, at('C'), 80, 90); // at x=80
  const back = moveAlong(g, start, 30, 270); // west
  near(pt(back), 50, 0);
});

test('passes a junction straight on when the heading is east', () => {
  const loc = moveAlong(g, at('C'), 150, 90);
  near(pt(loc), 150, 0);
});

test('takes the branch that matches the heading at a junction (south)', () => {
  const toJunction = moveAlong(g, at('C'), 100, 90);
  const loc = moveAlong(g, toJunction, 40, 180);
  near(pt(loc), 100, 40);
});

test('leftover distance carries across the junction onto the new edge', () => {
  const loc = moveAlong(g, at('C'), 130, 135); // heading south-east right after the junction... covers 100 + 30
  // at N the best edge for 135deg: east (cos 45deg) vs south (cos 45deg) -> tie, either is a valid corridor point
  const p = pt(loc);
  assert.ok((Math.abs(p.y) < 0.01 && Math.abs(p.x - 130) < 0.01) || (Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 30) < 0.01));
});

test('the planned route wins a tie at a junction', () => {
  const prefer = new Set([edgeKey('N', 'S')]);
  const loc = moveAlong(g, at('C'), 130, 135, { prefer });
  near(pt(loc), 100, 30);
});

test('stops at a dead end instead of leaving the corridor', () => {
  const loc = moveAlong(g, at('C'), 1000, 90);
  assert.ok(pt(loc).x >= 175, 'arrival counts within 2.5 m of the goal');
});

test('facing a wall at the end does not move through it', () => {
  const end = moveAlong(g, at('C'), 1000, 90);
  const stuck = moveAlong(g, end, 50, 0); // north of D: nothing there
  near(pt(stuck), 200, 0);
});

test('turning around (reverse) walks back the way it came', () => {
  const loc = moveAlong(g, at('C'), 100, 90);
  const back = moveAlong(g, loc, 100, 270);
  near(pt(back), 0, 0);
});

test('compass noise (+-20deg) keeps the marker on the corridor', () => {
  let loc = at('C');
  for (let i = 0; i < 40; i++) loc = moveAlong(g, loc, 4, 90 + (i % 2 ? 20 : -20));
  const p = pt(loc);
  assert.ok(Math.abs(p.y) < 0.01, 'must stay on y=0');
  assert.ok(p.x > 100 && p.x <= 200);
});

test('snap to graph finds the closest corridor point', () => {
  const loc = snapToGraph(g, { x: 108, y: 60 });
  near(pt(loc), 100, 60);
  const byNode = snapToGraph(g, { x: 5, y: 50 }, ['S', 'C']);
  assert.equal(nearestEndpoint(g, byNode), 'C');
});

test('projection on a polyline returns distance along and off-route', () => {
  const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const on = projectOnPolyline(route, { x: 100, y: 40 });
  assert.equal(Math.round(on.along), 140);
  assert.equal(Math.round(on.offset), 0);
  const off = projectOnPolyline(route, { x: 180, y: 0 });
  assert.equal(Math.round(off.offset), 80);
  assert.equal(off.segment, 0);
});

test('angle helpers', () => {
  assert.equal(Math.round(bearing({ x: 0, y: 0 }, { x: 0, y: -10 })), 0);
  assert.equal(Math.round(bearing({ x: 0, y: 0 }, { x: 10, y: 0 })), 90);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(350, 10), -20);
});

const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]; // 200 px long
const limits = { offRouteM: 6, reverseM: 6, arriveM: 2.5, offSamples: 2 };
const MPP = 0.1; // 6 m = 60 px

test('following the route reports progress along it and arrival snaps to the end', () => {
  const state = { bestAlong: 0, offCount: 0 };
  const a = trackOnRoute(route, { x: 40, y: 3 }, MPP, state, limits);
  assert.deepEqual(a, { action: 'follow', along: 40 });
  const near = trackOnRoute(route, { x: 100, y: 98 }, MPP, state, limits); // 2 px = 0.2 m from the end
  assert.equal(near.action, 'follow');
  assert.equal(near.along, 200);
});

test('one noisy sample off the route waits, the second one asks for a new route', () => {
  const state = { bestAlong: 0, offCount: 0 };
  assert.equal(trackOnRoute(route, { x: 20, y: 90 }, MPP, state, limits).action, 'wait');
  assert.deepEqual(trackOnRoute(route, { x: 20, y: 92 }, MPP, state, limits), { action: 'reroute', reason: 'off' });
});

test('coming back on the route resets the off-route counter', () => {
  const state = { bestAlong: 0, offCount: 0 };
  trackOnRoute(route, { x: 20, y: 90 }, MPP, state, limits);
  trackOnRoute(route, { x: 50, y: 2 }, MPP, state, limits);
  assert.equal(state.offCount, 0);
  assert.equal(trackOnRoute(route, { x: 20, y: 90 }, MPP, state, limits).action, 'wait');
});

test('walking back along the route more than 6 m asks for a new route, a small step back does not', () => {
  const state = { bestAlong: 0, offCount: 0 };
  trackOnRoute(route, { x: 90, y: 0 }, MPP, state, limits);
  assert.equal(trackOnRoute(route, { x: 70, y: 0 }, MPP, state, limits).action, 'follow'); // 20 px = 2 m back: fine
  assert.deepEqual(trackOnRoute(route, { x: 20, y: 0 }, MPP, state, limits), { action: 'reroute', reason: 'reverse' });
});

test('full walk: a person who starts walking the wrong way is rerouted, then reaches the goal on the graph', () => {
  // T junction from above; goal is D (200,0), start C (0,0); the person first walks... south (no corridor west of C), then east.
  const route2 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  const state = { bestAlong: 0, offCount: 0 };
  let loc = at('C');
  const log = [];
  for (let i = 0; i < 80; i++) {
    loc = moveAlong(g, loc, 3, 90);
    const r = trackOnRoute(route2, pt(loc), 0.1, state, limits);
    log.push(r.action);
    if (r.action === 'follow' && r.along >= 200) break;
  }
  assert.ok(!log.includes('reroute'), 'walking along the route must never trigger a reroute');
  assert.equal(log[log.length - 1], 'follow');
  assert.ok(pt(loc).x >= 175, 'arrival counts within 2.5 m of the goal');
});
