mkdir .serverless_plugins
mkdir .serverless_plugins/duplicate-api-plugin 
mv $(npm pack ../../ | tail -n 1) package.tgz
tar xf package.tgz
mv package/* .serverless_plugins/duplicate-api-plugin/
npx serverless package