export const listActiveStreams = jest.fn(() => Promise.resolve({ data: [] }));
export const startStream = jest.fn(() =>
  Promise.resolve({ data: { id: 'new-stream', status: 'started' } })
);
export const stopStream = jest.fn(() => Promise.resolve({ data: { success: true } }));
export const getStreamStatus = jest.fn(() => Promise.resolve({ data: { status: 'active' } }));
export const getStreamInfo = jest.fn(() => Promise.resolve({ data: {} }));
export const getRtmpServerInfo = jest.fn(() => Promise.resolve({ data: {} }));
