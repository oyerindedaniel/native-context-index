import type { ComponentType, SVGProps } from "react";
import {
  RocketLaunchIcon,
  LightBulbIcon,
  BookOpenIcon,
  RectangleStackIcon,
  BookmarkSquareIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import type { DocsIconName } from "./registry";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const docsGroupIcons: Record<DocsIconName, IconComponent> = {
  RocketLaunchIcon,
  LightBulbIcon,
  BookOpenIcon,
  RectangleStackIcon,
  BookmarkSquareIcon,
  TableCellsIcon,
};
