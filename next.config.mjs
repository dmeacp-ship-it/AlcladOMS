// Tax invoice uploads go through a Server Action; Vercel caps request bodies at 4.5 MB.
// staleTimes.dynamic: a list or page opened in the last 30 s shows again with no server trip (each one is
// ~0.4 s away in Sydney). Every Server Action calls revalidatePath and the Refresh button calls router.refresh,
// both of which drop this cache, so only other people's changes can show up to 30 s late on a revisit.
export default {
  experimental: { serverActions: { bodySizeLimit: '4mb' }, staleTimes: { dynamic: 30 } },
  async redirects() {
    return [
      {
        source: '/today',
        destination: '/orders',
        permanent: false,
      },
    ]
  },
}
