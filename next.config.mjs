// Tax invoice uploads go through a Server Action; Vercel caps request bodies at 4.5 MB.
export default { experimental: { serverActions: { bodySizeLimit: '4mb' } } }
