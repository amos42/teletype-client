require('./setup')
const assert = require('assert')
const deepEqual = require('deep-equal')
const {startTestServer} = require('@atom/real-time-server')
const condition = require('./helpers/condition')
const buildPeerPool = require('./helpers/build-peer-pool')
const buildStarNetwork = require('./helpers/build-star-network')

suite('StarOverlayNetwork', () => {
  let server

  suiteSetup(async () => {
    server = await startTestServer()
  })

  suiteTeardown(() => {
    return server.stop()
  })

  setup(() => {
    return server.reset()
  })

  suite('unicast', () => {
    test('sends messages to only one member of the network', async () => {
      const peer1Pool = await buildPeerPool('peer-1', server)
      const peer2Pool = await buildPeerPool('peer-2', server)
      const peer3Pool = await buildPeerPool('peer-3', server)

      const hub = buildStarNetwork('network-a', peer1Pool, true)
      const spoke1 = buildStarNetwork('network-a', peer2Pool, false)
      const spoke2 = buildStarNetwork('network-a', peer3Pool, false)
      await spoke1.connectTo('peer-1')
      await spoke2.connectTo('peer-1')

      spoke1.unicast('peer-3', 'spoke-to-spoke')
      spoke2.unicast('peer-1', 'spoke-to-hub')
      hub.unicast('peer-2', 'hub-to-spoke')

      await condition(() => deepEqual(hub.testInbox, [
        {senderId: 'peer-3', message: 'spoke-to-hub'}
      ]))
      await condition(() => deepEqual(spoke1.testInbox, [
        {senderId: 'peer-1', message: 'hub-to-spoke'}
      ]))
      await condition(() => deepEqual(spoke2.testInbox, [
        {senderId: 'peer-2', message: 'spoke-to-spoke'}
      ]))
    })

    test('sends messages only to peers that are part of the network', async () => {
      const peer1Pool = await buildPeerPool('peer-1', server)
      const peer2Pool = await buildPeerPool('peer-2', server)
      const peer3Pool = await buildPeerPool('peer-3', server)

      const hub = buildStarNetwork('network-a', peer1Pool, true)
      const spoke = buildStarNetwork('network-a', peer2Pool, false)
      await spoke.connectTo('peer-1')
      await peer1Pool.connectTo('peer-3')

      spoke.unicast('peer-3', 'this should never arrive')
      peer1Pool.send('peer-3', 'direct message')
      await condition(() => deepEqual(peer3Pool.testInbox, [
        {senderId: 'peer-1', message: 'direct message'}
      ]))
    })
  })

  suite('broadcast', () => {
    test('sends messages to all other members of the network', async () => {
      const peer1Pool = await buildPeerPool('peer-1', server)
      const peer2Pool = await buildPeerPool('peer-2', server)
      const peer3Pool = await buildPeerPool('peer-3', server)
      const peer4Pool = await buildPeerPool('peer-4', server)

      const hubA = buildStarNetwork('network-a', peer1Pool, true)
      const spokeA1 = buildStarNetwork('network-a', peer2Pool, false)
      const spokeA2 = buildStarNetwork('network-a', peer3Pool, false)
      await spokeA1.connectTo('peer-1')
      await spokeA2.connectTo('peer-1')

      const hubB = buildStarNetwork('network-b', peer1Pool, true)
      const spokeB1 = buildStarNetwork('network-b', peer2Pool, false)
      const spokeB2 = buildStarNetwork('network-b', peer3Pool, false)

      await spokeB1.connectTo('peer-1')
      await spokeB2.connectTo('peer-1')

      const hubC = buildStarNetwork('network-c', peer2Pool, true)
      const spokeC1 = buildStarNetwork('network-c', peer1Pool, false)
      const spokeC2 = buildStarNetwork('network-c', peer3Pool, false)

      await spokeC1.connectTo('peer-2')
      await spokeC2.connectTo('peer-2')

      hubA.broadcast('a1')
      spokeA1.broadcast('a2')
      spokeB1.broadcast('b')
      spokeC1.broadcast('c')

      await condition(() => deepEqual(hubA.testInbox, [
        {senderId: 'peer-2', message: 'a2'}
      ]))
      await condition(() => deepEqual(spokeA1.testInbox, [
        {senderId: 'peer-1', message: 'a1'}
      ]))
      await condition(() => deepEqual(spokeA2.testInbox, [
        {senderId: 'peer-1', message: 'a1'},
        {senderId: 'peer-2', message: 'a2'}
      ]))

      await condition(() => deepEqual(hubB.testInbox, [
        {senderId: 'peer-2', message: 'b'}
      ]))
      await condition(() => deepEqual(spokeB2.testInbox, [
        {senderId: 'peer-2', message: 'b'}
      ]))

      await condition(() => deepEqual(hubC.testInbox, [
        {senderId: 'peer-1', message: 'c'}
      ]))
      await condition(() => deepEqual(spokeC2.testInbox, [
        {senderId: 'peer-1', message: 'c'}
      ]))
    })

    test('sends messages only to peers that are part of the network', async () => {
      const peer1Pool = await buildPeerPool('peer-1', server)
      const peer2Pool = await buildPeerPool('peer-2', server)
      const peer3Pool = await buildPeerPool('peer-3', server)
      const peer4Pool = await buildPeerPool('peer-4', server)

      const hub = buildStarNetwork('some-network-id', peer1Pool, true)
      const spoke1 = buildStarNetwork('some-network-id', peer2Pool, false)
      const spoke2 = buildStarNetwork('some-network-id', peer3Pool, false)
      await spoke1.connectTo('peer-1')
      await spoke2.connectTo('peer-1')

      await peer4Pool.connectTo('peer-1')

      spoke1.broadcast('hello')
      await condition(() => deepEqual(hub.testInbox, [{
        senderId: 'peer-2',
        message: 'hello'
      }]))
      await condition(() => deepEqual(spoke2.testInbox, [{
        senderId: 'peer-2',
        message: 'hello'
      }]))

      // Ensure that spoke1 did not receive their own broadcast
      peer1Pool.send('peer-2', 'direct message')
      await condition(() => deepEqual(peer2Pool.testInbox, [
        {senderId: 'peer-1', message: 'direct message'}
      ]))

      // Ensure that peer 4 did not receive the broadcast since they are
      // not a member of the network
      peer1Pool.send('peer-4', 'direct message')
      await condition(() => deepEqual(peer4Pool.testInbox, [
        {senderId: 'peer-1', message: 'direct message'}
      ]))
    })
  })
})