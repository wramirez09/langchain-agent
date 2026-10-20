import matter from "gray-matter";
import yaml from "js-yaml";

/**
 * gray-matter with js-yaml 4.
 *
 * package.json pins js-yaml to 4.x for security advisories, but gray-matter's
 * default engine calls `yaml.safeLoad`, which js-yaml 4 removed (it throws).
 * In 4.x `load` is safe by default, so hand gray-matter that instead.
 */
export function parseFrontMatter(source: string) {
  return matter(source, {
    engines: { yaml: (s: string) => (yaml.load(s) ?? {}) as object },
  });
}
