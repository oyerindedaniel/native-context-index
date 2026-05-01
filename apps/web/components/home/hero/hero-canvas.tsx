"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

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
  float textClear = smoothstep(0.48, 0.66, uv.x) * (1.0 - smoothstep(0.20, 0.48, uv.y));
  float textFade = smoothstep(0.52, 0.84, uv.x) * (1.0 - smoothstep(0.18, 0.46, uv.y));
  float vignette = smoothstep(1.12, 0.18, length(p));

  float clearZone = clamp(textClear * 1.18 + textFade * 0.58, 0.0, 1.0);
  float checkerMask = (0.44 + modelFocus * 0.16) * (1.0 - clearZone * 0.98) * vignette;
  float indexBands = smoothstep(0.985, 1.0, sin((p.x * 3.2 + p.y * 4.4) * 7.0));

  vec3 lightTile = vec3(0.995, 0.993, 1.0);
  vec3 darkTile = vec3(0.942, 0.935, 0.982);
  vec3 tileColor = mix(lightTile, darkTile, checker);
  vec3 color = mix(paper, tileColor, checkerMask);
  color = mix(color, violet, checker * checkerMask * (0.014 + grain * 0.005));
  color = mix(color, slate, edge * checkerMask * 0.015);
  color = mix(color, violet, indexBands * 0.006 * vignette * (1.0 - textFade));
  color = mix(color, paper, smoothstep(0.16, 0.82, clearZone) * 0.94);

  gl_FragColor = vec4(color, 1.0);
}
`;

type HeroUniforms = {
  uTime: { value: number };
  uReveal: { value: number };
};

const BASE_LOGO_ROTATION = new THREE.Euler(0.06, -0.12, -0.72);

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

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

function HeroIndexField() {
  return (
    <mesh position={[0, 0, -2.5]} scale={[30, 30, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        uniforms={{}}
        vertexShader={indexFieldVertexShader}
        fragmentShader={indexFieldFragmentShader}
      />
    </mesh>
  );
}

function NCIModelMesh({
  uniforms,
  reducedMotion,
}: {
  uniforms: HeroUniforms;
  reducedMotion: boolean;
}) {
  const rawObject = useLoader(OBJLoader, "/nci.obj");
  const introStartRef = useRef<number | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const localHitRef = useRef(new THREE.Vector3());
  const entryTiltRef = useRef(new THREE.Vector2());
  const entryImpulseRef = useRef(0);
  const wasHittingRef = useRef(false);
  const logoPlaneRef = useRef(new THREE.Plane());
  const planeHitRef = useRef(new THREE.Vector3());

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
    const uniformScale = 1.7 / longestAxis;

    model.position.sub(boundingCenter);

    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.scale.setScalar(uniformScale);
    pivot.userData.baseScale = uniformScale;
    pivot.rotation.copy(BASE_LOGO_ROTATION);
    pivot.position.set(0, 0, 0);

    return pivot;
  }, [rawObject, uniforms]);

  useFrame((state, delta) => {
    introStartRef.current ??= state.clock.getElapsedTime();
    const elapsed = state.clock.getElapsedTime() - introStartRef.current;
    const reveal = Math.min(elapsed / 1.6, 1);
    pivotGroup.updateWorldMatrix(true, true);
    logoPlaneRef.current.setFromNormalAndCoplanarPoint(
      state.camera.getWorldDirection(logoPlaneRef.current.normal).negate(),
      pivotGroup.getWorldPosition(planeHitRef.current),
    );

    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hit = state.raycaster.intersectObject(pivotGroup, true)[0];
    const planeHit = state.raycaster.ray.intersectPlane(
      logoPlaneRef.current,
      planeHitRef.current,
    );
    const fallbackLocalHit = planeHit
      ? pivotGroup.worldToLocal(planeHit.clone())
      : null;
    const fallbackHit =
      fallbackLocalHit &&
      Math.abs(fallbackLocalHit.x) < 0.72 &&
      Math.abs(fallbackLocalHit.y) < 0.55;
    if (hit || fallbackHit) {
      const hitPoint = hit?.point ?? planeHitRef.current;
      localHitRef.current.copy(pivotGroup.worldToLocal(hitPoint.clone()));

      if (!wasHittingRef.current && !reducedMotion) {
        entryTiltRef.current.set(
          THREE.MathUtils.clamp(localHitRef.current.x / 0.72, -1, 1),
          THREE.MathUtils.clamp(localHitRef.current.y / 0.55, -1, 1),
        );
        entryImpulseRef.current = 1;
      }
    }

    wasHittingRef.current = Boolean(hit || fallbackHit);

    entryImpulseRef.current = THREE.MathUtils.damp(
      entryImpulseRef.current,
      0,
      4.8,
      delta,
    );

    const tiltImpulse = reducedMotion ? 0 : entryImpulseRef.current;
    const idleBounce = reducedMotion
      ? 0
      : Math.sin(state.clock.getElapsedTime() * 1.65) * 0.026 * reveal;
    const targetRotationX =
      BASE_LOGO_ROTATION.x + entryTiltRef.current.y * 0.075 * tiltImpulse;
    const targetRotationY =
      BASE_LOGO_ROTATION.y + entryTiltRef.current.x * 0.095 * tiltImpulse;
    const targetRotationZ =
      BASE_LOGO_ROTATION.z - entryTiltRef.current.x * 0.03 * tiltImpulse;

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
    pivotGroup.position.y = THREE.MathUtils.damp(
      pivotGroup.position.y,
      idleBounce,
      6.5,
      delta,
    );
    pivotGroup.scale.setScalar(
      THREE.MathUtils.damp(
        pivotGroup.scale.x,
        pivotGroup.userData.baseScale as number,
        10,
        delta,
      ),
    );
  });

  return <primitive object={pivotGroup} />;
}

function HeroScene() {
  const reducedMotion = usePrefersReducedMotion();
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
        <NCIModelMesh uniforms={logoUniforms} reducedMotion={reducedMotion} />
      </Suspense>

      <ambientLight intensity={0.7} />
      <directionalLight
        position={[2.5, 3.5, 3.5]}
        intensity={1.6}
        color="#ffffff"
      />
      <directionalLight
        position={[-2.5, -1.0, 2.0]}
        intensity={0.55}
        color="#dde3f0"
      />
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
    </>
  );
}

export function HeroCanvas() {
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
      >
        <color attach="background" args={["#ffffff"]} />
        <HeroScene />
      </Canvas>
    </div>
  );
}
