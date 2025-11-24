/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-markdown', 'remark-gfm', 'micromark', 'unist-util-stringify-position', 'unified', 'bail', 'is-plain-obj', 'trough', 'vfile', 'vfile-message', 'property-information', 'space-separated-tokens', 'comma-separated-tokens', 'hast-util-whitespace', 'remark-parse', 'remark-rehype', 'mdast-util-from-markdown', 'mdast-util-to-hast', 'mdast-util-to-string', 'hast-util-to-jsx-runtime'],
};

export default nextConfig;
