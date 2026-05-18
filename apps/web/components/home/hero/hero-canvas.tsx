"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import {
  type RefObject,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useReducedMotion } from "motion/react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

const indexFieldVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const indexFieldFragmentShader = `
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(1.85, 1.0);

  vec3 paper = vec3(1.0);
  vec3 violet = vec3(0.353, 0.235, 0.941);
  vec3 slate = vec3(0.45, 0.50, 0.60);

  vec2 checkerGrid = uv * vec2(164.0, 94.0);
  vec2 cell = floor(checkerGrid);
  vec2 cellUv = fract(checkerGrid);
  float checker = mod(cell.x + cell.y, 2.0);
  float grain = hash(cell);
  float edge = 1.0 - smoothstep(0.018, 0.055, min(min(cellUv.x, 1.0 - cellUv.x), min(cellUv.y, 1.0 - cellUv.y)));
  float modelFocus = smoothstep(0.95, 0.08, length(p - vec2(-0.08, 0.04)));
  float vignette = smoothstep(1.12, 0.18, length(p));
  float checkerMask = (0.44 + modelFocus * 0.16) * vignette;
  float indexBands = smoothstep(0.985, 1.0, sin((p.x * 3.2 + p.y * 4.4) * 7.0));

  vec3 lightTile = vec3(0.995, 0.993, 1.0);
  vec3 darkTile = vec3(0.942, 0.935, 0.982);
  vec3 tileColor = mix(lightTile, darkTile, checker);
  vec3 color = mix(paper, tileColor, checkerMask);
  color = mix(color, violet, checker * checkerMask * (0.014 + grain * 0.005));
  color = mix(color, slate, edge * checkerMask * 0.015);
  color = mix(color, violet, indexBands * 0.006 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;

type HeroUniforms = {
  uTime: { value: number };
  uReveal: { value: number };
};

const BASE_LOGO_ROTATION = new THREE.Euler(0.06, -0.12, -0.72);
/** Radians added at pointer extremes (mesh-local hit mapped to ±1). */
const LOGO_TILT_MAX_X = 0.09;
const LOGO_TILT_MAX_Y = 0.11;
const LOGO_TILT_MAX_Z = 0.028;
const LOGO_TILT_DAMP = 9;
/** Idle sway (radians) layered under pointer tilt — keeps motion after pointer leaves. */
const IDLE_TILT_AMP_X = 0.4;
const IDLE_TILT_AMP_Y = 0.34;
const IDLE_TILT_SPEED_X = 1.15;
const IDLE_TILT_SPEED_Y = 0.92;
const POINTER_TILT_BLEND = 0.55;

/** Set on the logo pivot in `NCIModelMesh` before layout runs. */
interface LogoPivotUserData {
  longestAxis: number;
  baseScale: number;
  layoutOffset: THREE.Vector3;
  tiltHalfWidth: number;
  tiltHalfHeight: number;
}

function logoPivotUserData(pivot: THREE.Object3D): LogoPivotUserData {
  return pivot.userData as LogoPivotUserData;
}

const LOGO_TARGET_SPAN_COMPACT = 1.32;
const LOGO_TARGET_SPAN_DEFAULT = 1.52;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function createLogoMaterial(uniforms: HeroUniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#5A3CF0"),
    metalness: 0.35,
    roughness: 0.28,
    envMapIntensity: 1.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uReveal = uniforms.uReveal;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vDissolveWorldPosition;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vDissolveWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform float uReveal;
varying vec3 vDissolveWorldPosition;

float logoHash(vec2 p) {
  return fract(sin(dot(p, vec2(41.0, 289.0))) * 45758.5453);
}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
vec2 dissolveCell = floor(vDissolveWorldPosition.xy * 18.0);
float dissolveNoise = logoHash(dissolveCell);
float diagonalReveal = (vDissolveWorldPosition.x - vDissolveWorldPosition.y) * 0.42 + 0.5;
float revealGate = uReveal * 1.24 - 0.12;
float dissolveValue = diagonalReveal + (dissolveNoise - 0.5) * 0.24;
float pixelMask = smoothstep(dissolveValue - 0.12, dissolveValue + 0.12, revealGate);
if (pixelMask < 0.035) discard;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `float dissolveEdge = (1.0 - smoothstep(0.015, 0.13, abs(revealGate - dissolveValue))) * (1.0 - uReveal);
gl_FragColor.rgb += vec3(0.28, 0.20, 0.72) * dissolveEdge;
gl_FragColor.rgb += vec3(0.05, 0.04, 0.15) * sin(uTime * 1.35 + vDissolveWorldPosition.x * 8.0) * 0.018;
#include <dithering_fragment>`,
      );
  };

  material.customProgramCacheKey = () => "nci-logo-dissolve-v1";

  return material;
}

export const HERO_BELOW_MD_MEDIA = "(max-width: 767px)";

function HeroIndexField() {
  return (
    <mesh position={[0, 0, -2.5]} scale={[30, 30, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        vertexShader={indexFieldVertexShader}
        fragmentShader={indexFieldFragmentShader}
      />
    </mesh>
  );
}

function HeroLogoLights({ tiltRef }: { tiltRef: RefObject<THREE.Vector2> }) {
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);

  useFrame((_, delta) => {
    const tx = tiltRef.current.x;
    const ty = tiltRef.current.y;
    const focus = Math.min(Math.hypot(tx, ty), 1);

    if (keyLightRef.current) {
      keyLightRef.current.position.set(2.4 + ty * 1.1, 3.2 + tx * 0.85, 3.8);
      keyLightRef.current.intensity = THREE.MathUtils.damp(
        keyLightRef.current.intensity,
        1.55 + focus * 0.42,
        8,
        delta,
      );
    }

    if (fillLightRef.current) {
      fillLightRef.current.position.set(
        -2.2 - ty * 0.65,
        -0.85 - tx * 0.45,
        2.2,
      );
      fillLightRef.current.intensity = THREE.MathUtils.damp(
        fillLightRef.current.intensity,
        0.48 + focus * 0.14,
        8,
        delta,
      );
    }
  });

  return (
    <>
      <ambientLight intensity={0.66} />
      <directionalLight
        ref={keyLightRef}
        position={[2.4, 3.2, 3.8]}
        intensity={1.55}
        color="#ffffff"
      />
      <directionalLight
        ref={fillLightRef}
        position={[-2.2, -0.85, 2.2]}
        intensity={0.48}
        color="#e8ecf8"
      />
    </>
  );
}

function NCIModelMesh({
  uniforms,
  reducedMotion,
  compactViewport,
  hoverTiltRef,
}: {
  uniforms: HeroUniforms;
  reducedMotion: boolean;
  compactViewport: boolean;
  hoverTiltRef: RefObject<THREE.Vector2>;
}) {
  const rawObject = useLoader(OBJLoader, "/nci.obj");
  const animTimeRef = useRef(0);
  const introAnchorRef = useRef<number | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const localHitRef = useRef(new THREE.Vector3());

  const pivotGroup = useMemo(() => {
    const model = rawObject.clone(true);
    const meshes: THREE.Mesh[] = [];

    model.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.computeVertexNormals();
        child.geometry.computeBoundingBox();
        child.geometry.computeBoundingSphere();
        child.material = createLogoMaterial(uniforms);
        meshes.push(child);
      }
    });
    meshesRef.current = meshes;

    const boundingBox = new THREE.Box3().setFromObject(model);
    const boundingCenter = boundingBox.getCenter(new THREE.Vector3());
    const boundingSize = boundingBox.getSize(new THREE.Vector3());
    const longestAxis =
      Math.max(boundingSize.x, boundingSize.y, boundingSize.z) || 1;

    model.position.sub(boundingCenter);

    const pivot = new THREE.Group();
    pivot.add(model);
    const pivotData: LogoPivotUserData = {
      longestAxis,
      baseScale: 1,
      layoutOffset: new THREE.Vector3(),
      tiltHalfWidth: 1,
      tiltHalfHeight: 1,
    };
    pivot.userData = pivotData;
    pivot.rotation.copy(BASE_LOGO_ROTATION);
    pivot.position.set(0, 0, 0);

    return pivot;
  }, [rawObject, uniforms]);

  useLayoutEffect(() => {
    const pivot = pivotGroup;
    const pivotData = logoPivotUserData(pivot);
    const targetSpan = compactViewport
      ? LOGO_TARGET_SPAN_COMPACT
      : LOGO_TARGET_SPAN_DEFAULT;
    const uniformScale = targetSpan / pivotData.longestAxis;
    pivot.scale.setScalar(uniformScale);
    pivotData.baseScale = uniformScale;

    // Bbox-center the OBJ at load; after rotation the projected AABB center can still
    // drift (asymmetric mesh). Nudge the pivot so the logo sits optically centered.
    pivot.position.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    const opticalCenter = new THREE.Box3()
      .setFromObject(pivot)
      .getCenter(new THREE.Vector3());
    pivotData.layoutOffset.copy(opticalCenter.negate());
    pivot.position.copy(pivotData.layoutOffset);
    pivot.updateMatrixWorld(true);

    const tiltBox = new THREE.Box3().setFromObject(pivot);
    const tiltSize = tiltBox.getSize(new THREE.Vector3());
    pivotData.tiltHalfWidth = Math.max(tiltSize.x * 0.5, 0.001);
    pivotData.tiltHalfHeight = Math.max(tiltSize.y * 0.5, 0.001);
  }, [pivotGroup, compactViewport]);

  useFrame((state, delta) => {
    animTimeRef.current += delta;
    introAnchorRef.current ??= animTimeRef.current;
    const elapsed = animTimeRef.current - introAnchorRef.current;
    const animTime = animTimeRef.current;
    const reveal = Math.min(elapsed / 1.6, 1);
    pivotGroup.updateWorldMatrix(true, true);

    const pivotData = logoPivotUserData(pivotGroup);
    const idleTiltX = reducedMotion
      ? 0
      : Math.sin(animTime * IDLE_TILT_SPEED_X) * IDLE_TILT_AMP_X * reveal;
    const idleTiltY = reducedMotion
      ? 0
      : Math.cos(animTime * IDLE_TILT_SPEED_Y) * IDLE_TILT_AMP_Y * reveal;

    let targetTiltX = idleTiltX;
    let targetTiltY = idleTiltY;

    if (!reducedMotion) {
      state.raycaster.setFromCamera(state.pointer, state.camera);
      const hit = state.raycaster.intersectObject(pivotGroup, true)[0];
      if (hit) {
        localHitRef.current.copy(hit.point);
        pivotGroup.worldToLocal(localHitRef.current);
        const pointerTiltY = THREE.MathUtils.clamp(
          localHitRef.current.x / pivotData.tiltHalfWidth,
          -1,
          1,
        );
        const pointerTiltX = THREE.MathUtils.clamp(
          localHitRef.current.y / pivotData.tiltHalfHeight,
          -1,
          1,
        );
        targetTiltX = idleTiltX + pointerTiltX * POINTER_TILT_BLEND;
        targetTiltY = idleTiltY + pointerTiltY * POINTER_TILT_BLEND;
      }
    }

    hoverTiltRef.current.x = THREE.MathUtils.damp(
      hoverTiltRef.current.x,
      targetTiltX,
      LOGO_TILT_DAMP,
      delta,
    );
    hoverTiltRef.current.y = THREE.MathUtils.damp(
      hoverTiltRef.current.y,
      targetTiltY,
      LOGO_TILT_DAMP,
      delta,
    );

    const idleBounce = reducedMotion
      ? 0
      : Math.sin(state.clock.getElapsedTime() * 1.65) * 0.026 * reveal;
    const tiltX = hoverTiltRef.current.x;
    const tiltY = hoverTiltRef.current.y;
    const targetRotationX = BASE_LOGO_ROTATION.x + tiltX * LOGO_TILT_MAX_X;
    const targetRotationY = BASE_LOGO_ROTATION.y + tiltY * LOGO_TILT_MAX_Y;
    const targetRotationZ = BASE_LOGO_ROTATION.z - tiltX * LOGO_TILT_MAX_Z;

    uniforms.uTime.value = reducedMotion ? 2 : elapsed;
    uniforms.uReveal.value = reducedMotion ? 1 : easeOutCubic(reveal);
    pivotGroup.rotation.x = THREE.MathUtils.damp(
      pivotGroup.rotation.x,
      targetRotationX,
      7.5,
      delta,
    );
    pivotGroup.rotation.y = THREE.MathUtils.damp(
      pivotGroup.rotation.y,
      targetRotationY,
      7.5,
      delta,
    );
    pivotGroup.rotation.z = THREE.MathUtils.damp(
      pivotGroup.rotation.z,
      targetRotationZ,
      7.5,
      delta,
    );
    const { layoutOffset, baseScale } = pivotData;
    pivotGroup.position.x = layoutOffset.x;
    pivotGroup.position.z = layoutOffset.z;
    pivotGroup.position.y = THREE.MathUtils.damp(
      pivotGroup.position.y,
      layoutOffset.y + idleBounce,
      6.5,
      delta,
    );
    pivotGroup.scale.setScalar(
      THREE.MathUtils.damp(pivotGroup.scale.x, baseScale, 10, delta),
    );
  });

  return <primitive object={pivotGroup} />;
}

function HeroScene({
  compactLogoScale,
}: {
  readonly compactLogoScale: boolean;
}) {
  const reducedMotion = useReducedMotion() === true;
  const hoverTiltRef = useRef(new THREE.Vector2());
  const logoUniforms = useMemo<HeroUniforms>(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: 0 },
    }),
    [],
  );

  return (
    <>
      <HeroIndexField />

      <Suspense fallback={null}>
        <NCIModelMesh
          uniforms={logoUniforms}
          reducedMotion={reducedMotion}
          compactViewport={compactLogoScale}
          hoverTiltRef={hoverTiltRef}
        />
      </Suspense>

      <HeroLogoLights tiltRef={hoverTiltRef} />
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
    </>
  );
}

export function HeroCanvas() {
  const isBelowMd = useMediaQuery(HERO_BELOW_MD_MEDIA);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Canvas
        className="block h-full w-full"
        camera={{ position: [0, 0, 4.5], fov: 38 }}
        dpr={[1, 1.75]}
        resize={{ scroll: false }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          // ANGLE/D3D often logs benign float-precision warnings for MeshPhysicalMaterial.
          gl.debug.checkShaderErrors = false;
        }}
      >
        <color attach="background" args={["#ffffff"]} />
        <HeroScene compactLogoScale={isBelowMd} />
      </Canvas>
    </div>
  );
}
