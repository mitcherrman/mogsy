import type { ImgHTMLAttributes } from "react";

import {
  getMogzyArtAssetPath,
  getMogzyArtDefaultAlt,
  type MogzyArtAsset,
  type MogzyClassCharacter,
  type MogzyCompanion,
  type MogzyFamilyCharacter,
  type MogzyMascotPose,
} from "./mascot-assets";

type NativeImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "draggable"
>;

interface SharedMogzyArtProps extends NativeImageProps {
  /**
   * Accessible description for a meaningful image.
   *
   * This is ignored when decorative is true.
   */
  alt?: string;

  /**
   * Use true when the image does not communicate information that is missing
   * from nearby text.
   */
  decorative?: boolean;
}

export interface MogzyArtProps extends SharedMogzyArtProps {
  /**
   * Explicitly identifies which part of the Mogzy art system is being used.
   *
   * Do not use family members, class characters, or companions as mascot
   * reaction poses.
   */
  asset: MogzyArtAsset;
}

/**
 * Generic renderer for every canonical Mogzy product-art category.
 *
 * Prefer the more specific wrapper components below when the category is known.
 */
export function MogzyArt({
  asset,
  alt,
  decorative = false,
  className,
  loading = "lazy",
  decoding = "async",
  ...imageProps
}: MogzyArtProps) {
  const resolvedAlt = decorative
    ? ""
    : (alt ?? getMogzyArtDefaultAlt(asset));

  const classes = [
    "block max-w-full select-none object-contain",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <img
      {...imageProps}
      src={getMogzyArtAssetPath(asset)}
      alt={resolvedAlt}
      aria-hidden={decorative ? true : undefined}
      className={classes}
      draggable={false}
      loading={loading}
      decoding={decoding}
      data-mogzy-art-category={asset.category}
      data-mogzy-art-name={asset.name}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Mogzy mascot                                                               */
/* -------------------------------------------------------------------------- */

export interface MogzyMascotProps extends SharedMogzyArtProps {
  /**
   * A reaction or activity performed specifically by Mogzy.
   */
  pose?: MogzyMascotPose;
}

export function MogzyMascot({
  pose = "base",
  ...props
}: MogzyMascotProps) {
  return (
    <MogzyArt
      {...props}
      asset={{
        category: "mascot",
        name: pose,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Royal family                                                               */
/* -------------------------------------------------------------------------- */

export interface MogzyFamilyProps extends SharedMogzyArtProps {
  /**
   * A distinct member of Mogzy's royal family.
   */
  character: MogzyFamilyCharacter;
}

export function MogzyFamily({
  character,
  ...props
}: MogzyFamilyProps) {
  return (
    <MogzyArt
      {...props}
      asset={{
        category: "family",
        name: character,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Ranked classes                                                             */
/* -------------------------------------------------------------------------- */

export interface MogzyClassProps extends SharedMogzyArtProps {
  /**
   * A Ranked combat class character.
   */
  character: MogzyClassCharacter;
}

export function MogzyClass({
  character,
  ...props
}: MogzyClassProps) {
  return (
    <MogzyArt
      {...props}
      asset={{
        category: "class",
        name: character,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Companions                                                                 */
/* -------------------------------------------------------------------------- */

export interface MogzyCompanionProps extends SharedMogzyArtProps {
  /**
   * A non-humanoid magical companion.
   */
  companion: MogzyCompanion;
}

export function MogzyCompanion({
  companion,
  ...props
}: MogzyCompanionProps) {
  return (
    <MogzyArt
      {...props}
      asset={{
        category: "companion",
        name: companion,
      }}
    />
  );
}