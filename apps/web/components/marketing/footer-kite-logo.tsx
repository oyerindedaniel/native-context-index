"use client";

import * as React from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

const KITE_VIEWBOX = "0 0 209 206";
const PERSPECTIVE_PX = 1100;
const POINTER_SPRING_STIFFNESS = 140;
const POINTER_SPRING_DAMPING = 22;
const ENTRANCE_SPRING_STIFFNESS = 88;
const ENTRANCE_SPRING_DAMPING = 17;
const MAX_TILT_DEG = 11;
const MAX_LAYER_SHIFT_PX = 15;
/** Corner facets share this weight so they track the body, not each other. */
const HIGHLIGHT_DEPTH_WEIGHT = 0.36;

type FooterKitePathSpec = {
  pathKey: string;
  pathData: string;
  fill: string;
  depthWeight: number;
};

/** Main mass + center sail — independent depth reads well on the triangle. */
const FOOTER_KITE_BODY_PATH_SPECS: readonly FooterKitePathSpec[] = [
  {
    pathKey: "wing-primary",
    pathData:
      "M113.578 128.983C114.293 125.762 118.152 120.96 119.794 119.076C126.852 110.32 149.398 82.7926 149.398 82.7926C149.398 82.7926 165.496 61.7966 165.746 61.6526C166.272 61.3486 168.082 62.4567 169.676 63.596C171.668 65.0201 175.369 69.4369 177.378 76.9361C179.387 84.4354 177.986 95.0155 173.072 103.528C168.157 112.041 158.042 126.95 158.042 126.95C150.672 137.29 134.651 159.486 129.958 165.866C123.967 174.009 120.514 178.449 114.534 182.12C109.655 185.116 102.089 186.125 98.5727 186.092C95.8943 185.642 90.2001 184.139 85.3771 181.073C80.9399 178.252 80.4604 177.827 76.4955 173.797C65.6267 160.647 43.0351 130.705 33.1816 117.827C31.2157 114.828 29.1081 111.988 26.2705 107.073C24.0881 102.482 23.8781 100.497 23.1343 97.1818C22.3905 93.8666 22.7323 85.946 23.9392 80.3345C25.4501 75.2495 27.0225 72.7033 29.0203 69.6777C30.6184 67.2571 32.2871 65.6072 32.9216 65.0848C33.1174 65.0857 33.7522 65.3074 36.2043 68.3384C38.7432 71.3453 66.2391 111.848 71.0962 118.639C74.9819 124.072 76.3322 127.708 76.5216 128.847C79.5439 141.378 80.6844 148.41 83.3517 160.945C84.0798 164.503 87.3714 171.637 94.7125 171.704C102.054 171.772 105.123 166.63 106.068 164.213C108.052 154.407 111.568 134.825 112.067 134.068C112.29 133.238 112.087 132.887 113.578 128.983Z",
    fill: "#5A3CF0",
    depthWeight: 0.38,
  },
  {
    pathKey: "wing-left",
    pathData:
      "M41.6292 55.8449C39.3983 56.1967 33.2436 58.3459 31.1372 59.562L36.0937 60.445C36.8635 60.5622 38.3177 61.1893 38.7882 61.4637L43.4427 67.9039C54.087 83.3678 76.1405 115.539 79.1996 120.513C82.2586 125.487 82.6597 129.749 83.5248 132.058C85.2652 140.883 88.7989 159.111 89.7124 161.017C90.6259 162.924 92.036 163.42 92.1102 163.143C92.1844 162.866 91.9333 100.667 91.5776 60.4745C91.3815 59.7295 90.8609 57.6117 89.2468 56.4373C87.3286 54.7363 83.1038 54.4451 81.3189 54.4614L51.9576 54.644C49.9725 54.854 43.86 55.493 41.6292 55.8449Z",
    fill: "#5A3CF0",
    depthWeight: 0.4,
  },
  {
    pathKey: "sail-center",
    pathData:
      "M97.2091 60.4997L98.0185 163.243C98.4238 163.945 100.266 162.413 100.671 160.541C101.714 155.726 104.118 144.134 105.39 136.285C106.662 128.436 109.86 122.003 111.3 119.767C129.87 96.5243 140.479 83.9636 158.851 60.2503C161.584 55.3263 144.83 54.2443 143.136 54.1107C128.855 53.6967 110.058 54.2983 104.851 54.6835C99.6436 55.0687 97.5866 58.7214 97.2091 60.4997Z",
    fill: "#5A3CF0",
    depthWeight: 0.22,
  },
] as const;

/** Corner highlight facets (#7A63F5, #4429C6) — one transform for both. */
const FOOTER_KITE_HIGHLIGHT_PATH_SPECS: readonly FooterKitePathSpec[] = [
  {
    pathKey: "facet-light",
    pathData:
      "M32.9216 65.0846C32.2871 65.607 30.6184 67.2569 29.0202 69.6775C27.0225 72.7032 25.4501 75.2493 23.9392 80.3343C22.7323 85.9458 22.3905 93.8664 23.1343 97.1816C23.8781 100.497 24.0881 102.482 26.2705 107.073C29.1081 111.988 31.2157 114.827 33.1816 117.827C43.0351 130.705 65.6268 160.647 76.4955 173.797C80.4604 177.827 81.0699 178.134 85.5071 180.955C90.3168 183.98 95.6412 185.558 98.3706 186.059C97.6166 186.104 95.5855 185.945 94.1972 185.81C92.2512 185.765 90.002 185.228 87.0948 183.931C86.1404 183.526 85.1516 183.045 84.149 182.474C83.7566 182.251 83.3621 182.014 82.9667 181.762C79.7384 179.414 74.9857 175.37 73.4771 173.433C61.0273 157.139 36.0116 124.431 31.6019 118.739C31.3938 118.461 31.1913 118.19 30.9941 117.926C30.8543 117.745 30.7279 117.581 30.6156 117.436C24.4954 109.268 24.1214 108.08 23.6303 106.959C22.9185 105.185 20.8127 100.862 20.6226 97.6956C20.2298 94.1777 20.5882 95.6091 20.4703 86.0816C20.7724 80.5244 23.1543 75.3266 24.4095 73.0416C25.2057 71.1777 27.9797 67.4698 28.5805 66.8889C29.1204 66.2027 30.808 64.6667 31.5843 63.9844C31.7351 63.9754 32.2137 64.1828 32.9216 65.0846Z",
    fill: "#7A63F5",
    depthWeight: HIGHLIGHT_DEPTH_WEIGHT,
  },
  {
    pathKey: "facet-dark",
    pathData:
      "M31.1374 59.5619L35.817 60.3707L30.9837 64.5654C28.5806 66.889 22.7756 73.0489 21.482 81.7531C18.7589 96.8994 22.3131 104.677 25.86 110.82C30.4403 117.538 70.7859 169.744 73.0719 172.731C79.0835 179.09 79.9141 179.312 82.1092 181.087C84.3042 182.863 87.669 184.19 89.9853 184.959C91.8384 185.575 95.2187 185.916 96.6772 186.011C96.2248 186.038 93.9976 186.113 88.7686 186.136C82.482 185.787 80.591 184.538 76.2081 182.622C72.6287 180.476 67.1278 175.227 64.7731 172.139C52.2558 155.728 26.5834 121.964 24.0325 118.195C20.8439 113.482 19.959 112.355 17.3983 107.515C15.3498 103.642 14.2596 97.0787 13.9706 94.2811C13.9567 93.0409 13.8692 89.5653 14.3323 85.1788C14.7955 80.7924 16.9313 76.0331 17.8536 74.2524C18.9266 72.4627 21.5627 68.2727 23.5228 65.8305C25.4829 63.3882 29.4159 60.6338 31.1374 59.5619Z",
    fill: "#4429C6",
    depthWeight: HIGHLIGHT_DEPTH_WEIGHT,
  },
] as const;

function FooterKiteLayer({
  pathSpec,
  pointerSpringX,
  pointerSpringY,
}: {
  pathSpec: FooterKitePathSpec;
  pointerSpringX: MotionValue<number>;
  pointerSpringY: MotionValue<number>;
}) {
  const layerShiftX = useTransform(
    pointerSpringX,
    (normX) => normX * pathSpec.depthWeight * MAX_LAYER_SHIFT_PX,
  );
  const layerShiftY = useTransform(
    pointerSpringY,
    (normY) => normY * pathSpec.depthWeight * MAX_LAYER_SHIFT_PX * 0.82,
  );

  return (
    <motion.g style={{ x: layerShiftX, y: layerShiftY }}>
      <path d={pathSpec.pathData} fill={pathSpec.fill} />
    </motion.g>
  );
}

function FooterKiteHighlightPair({
  pathSpecs,
  pointerSpringX,
  pointerSpringY,
}: {
  pathSpecs: readonly FooterKitePathSpec[];
  pointerSpringX: MotionValue<number>;
  pointerSpringY: MotionValue<number>;
}) {
  const layerShiftX = useTransform(
    pointerSpringX,
    (normX) => normX * HIGHLIGHT_DEPTH_WEIGHT * MAX_LAYER_SHIFT_PX,
  );
  const layerShiftY = useTransform(
    pointerSpringY,
    (normY) => normY * HIGHLIGHT_DEPTH_WEIGHT * MAX_LAYER_SHIFT_PX * 0.82,
  );

  return (
    <motion.g style={{ x: layerShiftX, y: layerShiftY }}>
      {pathSpecs.map((pathSpec) => (
        <path
          key={pathSpec.pathKey}
          d={pathSpec.pathData}
          fill={pathSpec.fill}
        />
      ))}
    </motion.g>
  );
}

export interface FooterKiteLogoProps {
  className?: string;
}

export function FooterKiteLogo({ className }: FooterKiteLogoProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(wrapperRef, { once: true, amount: 0.3 });
  const reduceMotion = useReducedMotion() === true;

  const pointerX = useSpring(0, {
    stiffness: POINTER_SPRING_STIFFNESS,
    damping: POINTER_SPRING_DAMPING,
  });
  const pointerY = useSpring(0, {
    stiffness: POINTER_SPRING_STIFFNESS,
    damping: POINTER_SPRING_DAMPING,
  });

  const tiltRotateY = useTransform(pointerX, (normX) => normX * MAX_TILT_DEG);
  const tiltRotateX = useTransform(
    pointerY,
    (normY) => normY * -MAX_TILT_DEG * 0.72,
  );
  const shadowOffsetX = useTransform(pointerX, (normX) => normX * 18);
  const shadowOffsetY = useTransform(pointerY, (normY) => normY * 12 + 8);
  const shadowScale = useTransform(
    pointerY,
    (normY) => 1 - Math.abs(normY) * 0.06,
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduceMotion) {
        return;
      }

      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const normX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const normY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;

      pointerX.set(normX);
      pointerY.set(normY);
    },
    [pointerX, pointerY, reduceMotion],
  );

  const resetPointer = React.useCallback(() => {
    pointerX.set(0);
    pointerY.set(0);
  }, [pointerX, pointerY]);

  return (
    <motion.div
      ref={wrapperRef}
      className={cn("relative select-none", className)}
      style={{ perspective: PERSPECTIVE_PX }}
      aria-label="Native Context Index"
      onPointerMove={reduceMotion ? undefined : handlePointerMove}
      onPointerLeave={reduceMotion ? undefined : resetPointer}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[88%] h-6 w-[58%] -translate-x-1/2 rounded-[100%] bg-primary/18 blur-xl"
        style={{
          x: reduceMotion ? 0 : shadowOffsetX,
          y: reduceMotion ? 0 : shadowOffsetY,
          scale: reduceMotion ? 1 : shadowScale,
        }}
      />

      <motion.div
        className="relative will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
        initial={
          reduceMotion ? false : { rotateX: 20, scale: 0.9, opacity: 0, y: 28 }
        }
        animate={
          inView || reduceMotion
            ? { rotateX: 0, scale: 1, opacity: 1, y: 0 }
            : { rotateX: 20, scale: 0.9, opacity: 0, y: 28 }
        }
        transition={{
          type: "spring",
          stiffness: ENTRANCE_SPRING_STIFFNESS,
          damping: ENTRANCE_SPRING_DAMPING,
          mass: 0.9,
        }}
      >
        <motion.div
          style={{
            transformStyle: "preserve-3d",
            rotateX: reduceMotion ? 0 : tiltRotateX,
            rotateY: reduceMotion ? 0 : tiltRotateY,
          }}
        >
          <svg
            viewBox={KITE_VIEWBOX}
            className="h-auto w-full drop-shadow-[0_28px_48px_-20px_rgb(90_60_240/0.45)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            {FOOTER_KITE_BODY_PATH_SPECS.map((pathSpec) => (
              <FooterKiteLayer
                key={pathSpec.pathKey}
                pathSpec={pathSpec}
                pointerSpringX={pointerX}
                pointerSpringY={pointerY}
              />
            ))}
            <FooterKiteHighlightPair
              pathSpecs={FOOTER_KITE_HIGHLIGHT_PATH_SPECS}
              pointerSpringX={pointerX}
              pointerSpringY={pointerY}
            />
          </svg>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
