export const streamService = {
  getStreams: jest.fn(() => Promise.resolve([])),
  startStream: jest.fn(() => Promise.resolve({ id: 'new-stream', status: 'started' })),
  stopStream: jest.fn(() => Promise.resolve({ success: true })),
  getStreamStatus: jest.fn(() => Promise.resolve({ status: 'active' }))
};