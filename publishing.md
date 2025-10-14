# Publishing

## publishing using local .npmrc file (Github)

```bash
npm login --scope=@m41na --auth-type=legacy --registry=https://npm.pkg.github.com
npm publish
```

## publishing to registry.npmjs.org

```bash
npm login   # opens browser at https://registry.npmjs.org/ for signing in
npm publish --access=public
```