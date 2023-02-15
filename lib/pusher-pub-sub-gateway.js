const Pusher = require('pusher-js')
// const Pusher = require('pusher-js/dist/web/pusher')
const {Disposable} = require('event-kit')
const Errors = require('./errors')

module.exports =
class PusherPubSubGateway {
  constructor ({key, options}) {
    this.pusherKey = key
    this.connectOptions = Object.assign({
      encrypted: true,
    }, options)

    this.channelsByName = new Map()
    this.subscriptionsCount = 0
    // this.pusherClient = createDisconnectedPusherClient(key, options)
    this.pusherClient = undefined
  }

  async subscribe (channelName, eventName, callback) {
    if (this.subscriptionsCount === 0) await this.connect()

    channelName = channelName.replace(/\//g, '.')
    let channel = this.channelsByName.get(channelName)
    if (!channel) {
      channel = this.pusherClient.subscribe(channelName)
      await new Promise((resolve, reject) => {
        channel.bind('pusher:subscription_succeeded', resolve)
        channel.bind('pusher:subscription_error', reject)
      })
      this.channelsByName.set(channelName, channel)
    }

    channel.bind(eventName, callback)
    this.subscriptionsCount++

    return new Disposable(() => {
      channel.unsubscribe()
      channel.unbind(eventName, callback)
      this.channelsByName.delete(eventName)

      this.subscriptionsCount--
      if (this.subscriptionsCount === 0) this.disconnect()
    })
  }

  connect () {
    const error = new Errors.PubSubConnectionError('Error establishing web socket connection to signaling server')
    this.pusherClient = createPusherClient(this.pusherKey, this.connectOptions)
    // this.pusherClient.connect()
    return new Promise((resolve, reject) => {
      const handleConnection = () => {
        this.pusherClient.connection.unbind('connected', handleConnection)
        this.pusherClient.connection.unbind('error', handleError)
        resolve()
      }

      const handleError = () => {
        this.pusherClient.connection.unbind('connected', handleConnection)
        this.pusherClient.connection.unbind('error', handleError)
        reject(error)
      }

      this.pusherClient.connection.bind('connected', handleConnection)
      this.pusherClient.connection.bind('error', handleError)
    })
  }

  disconnect () {
    this.channelsByName.forEach((channel) => {
      this.pusherClient.unsubscribe(channel)
    })
    this.channelsByName.clear()
    setTimeout(() => {
      this.pusherClient.disconnect()
      this.pusherClient.dispose()
      this.pusherClient = undefined
    }, 1);    
  }
}

function createPusherClient (pusherKey, connectOptions) {
  const client = new Pusher(pusherKey, connectOptions) // automatically connects to pusher
  return client
}

// function createDisconnectedPusherClient (key, options) {
//   const client = new Pusher(key, connectOptions) // automatically connects to pusher
//   client.disconnect()
//   return client
// }
