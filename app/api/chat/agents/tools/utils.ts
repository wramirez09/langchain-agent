import { HtmlContext } from "next/dist/server/route-modules/pages/vendored/contexts/entrypoints";
import { RawCreateParams, string, ZodString } from "zod";

export const cleanRegex = /\nSTATEMENT[\s\S]*?5\nREFERENCES/g;
