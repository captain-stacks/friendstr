import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash,
  getSignature
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool = new SimplePool()
window.pool = pool
window.nip19 = nip19
window.nip04 = nip04
window.pool = pool
window.getPublicKey = getPublicKey
window.getEventHash = getEventHash
window.getSignature = getSignature

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page />} />
      </Routes>
    </Router>
  )
}

function Page() {
  const { npub } = useParams()
  const [pubkey, setPubkey] = useState()
  const [profile, setProfile] = useState({})
  const [followCount, setFollowCount] = useState(0)
  const [showFollowAll, setShowFollowAll] = useState()
  const [contacts, setContacts] = useState([])
  const [inactive, setInactive] = useState([])
  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://relayable.org',
    'wss://nostr.thank.eu',
    'wss://relay.nostr.bg',
    'wss://relay.primal.net',
    'wss://nostr.bitcoiner.social',
    'wss://relay.nostrati.com',
    'wss://relay.orangepill.dev',
  ].map(r => [r, { read: true, write: true }]))

  useEffect(() => {
    let pubkey = npub ? nip19.decode(npub).data : localStorage.getItem('pubkey')
    if (pubkey) {
      setPubkey(pubkey)
    } else {
      setTimeout(() => {
        if (!window.nostr) {
          alert('no nostr')
          return
        }
        window.nostr.getPublicKey()
          .then(pubkey => {
            localStorage.setItem('pubkey', pubkey)
            setPubkey(pubkey)
          }).catch(e => alert('couldnt get pubkey'))
      }, 200)
    }
  }, [npub])

  useEffect(() => {
    if (pubkey) {
      (async () => {
        await findProfile()
      })()
    }
  }, [pubkey])

  function getReadRelays() {
    return relays.filter(r => r[1].read).map(r => r[0])
  }

  function getWriteRelays() {
    return relays.filter(r => r[1].write).map(r => r[0])
  }

  function getAllRelays() {
    return relays.map(r => r[0])
  }

  window.getAllRelays = () => relays.map(r => r[0])

  async function findProfile() {
    setInactive([])
    let events = await pool.list(getAllRelays(), [{
      kinds: [0, 3],
      authors: [pubkey]
    }])
    let profile = events.filter(e => e.kind === 0)
    profile.sort((a, b) => b.created_at - a.created_at)
    profile = profile[0]
    let follows = events.filter(e => e.kind === 3)
    follows.sort((a, b) => b.created_at - a.created_at)
    follows = follows[0]
    follows = follows.tags.filter(t => t[0] === 'p').map(t => t[1])
    setContacts(follows)
    const followCount = follows.length
    setFollowCount(followCount)
    let c = JSON.parse(profile.content)
    c.name = c.name || c.display_name || c.displayName || c.username
    c.npub = nip19.npubEncode(pubkey)
    setProfile(c)

    events = await pool.list(getAllRelays(), [{
      kinds: [3],
      authors: follows
    }])

    let followMap = {}
    events.forEach(e => {
      let list = followMap[e.pubkey] || []
      followMap[e.pubkey] = list
      list.push(e)
    })

    events = Object.values(followMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })

    let followedBy = {}
    events.forEach(follower => {
      follower.tags.filter(t => t[0] === 'p').map(t => t[1]).forEach(followee => {
        followedBy[followee] = followedBy[followee] || new Set()
        followedBy[followee].add(follower.pubkey)
      })
    })
    console.log(followedBy)
    console.log('follows length', follows.length)
    let max = Math.floor(follows.length / 10)
    console.log('max', max)
    let friends = Object.entries(followedBy)
      .filter(e => !follows.includes(e[0]) && e[0] !== pubkey)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 400)
    
    console.log('friends', friends)

    let friendPubkeys = friends.map(f => f[0])
    // console.log('friendPubkeys', friendPubkeys)
    events = await pool.list(getAllRelays(), [{
      kinds: [0, 3],
      authors: friendPubkeys
    }])

    let friendMap = {}
    followMap = {}
    events.forEach(e => {
      if (e.kind === 0) {
        let list = friendMap[e.pubkey] || []
        friendMap[e.pubkey] = list
        list.push(e)
      } else {
        let list = followMap[e.pubkey] || []
        followMap[e.pubkey] = list
        list.push(e)
      }
    })
    events = Object.values(friendMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    follows = Object.values(followMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    followMap = {}
    follows.forEach(follower => {
      followMap[follower.pubkey] = {
        followsMe: follower.tags.some(t => t[1] === pubkey),
        count: 0,
        followsCount: follower.tags.filter(t => t[0] === 'p').length
      }
      follower.tags.filter(t => t[0] === 'p').map(t => t[1]).forEach(followee => {
        if (followedBy[follower.pubkey]?.has(followee)) {
          followMap[follower.pubkey].count++
        }
      })
    })
    console.log(followMap)

    let topFriends = events.filter(e => followMap[e.pubkey]?.count > 0).map(e => {
      const c = JSON.parse(e.content)
      let score = followMap[e.pubkey].count
      const followsCount = followMap[e.pubkey].followsCount
      const multiplier = followsCount > followCount ? followCount / followsCount : 1
      score *= multiplier
      return {
        pubkey: e.pubkey,
        name: c.name || c.display_name || c.displayName || c.username,
        picture: c.picture,
        score: Math.ceil(score),
        follows: followsCount,
        percentage: Math.ceil(score / followCount * 100),
        followsMe: followMap[e.pubkey].followsMe,
      }
    })
    topFriends = topFriends.sort((a, b) => b.percentage - a.percentage).slice(0, 250)
    console.log('topFriends', topFriends)
    setInactive(topFriends)
    setShowFollowAll(true)
  }

  async function followAll() {
    setShowFollowAll(false)
    const events = await pool.list(getAllRelays(), [{
      kinds: [3],
      authors: [await window.nostr.getPublicKey()]
    }])
    events.sort((a, b) => b.created_at - a.created_at)
    let contactList = events[0]
    const follows = new Set(contactList.tags.filter(t => t[0] === 'p').map(t => t[1]))
    const tags = contactList.tags.filter(t => t[0] !== 'p')
    inactive.map(p => p.pubkey).forEach(pubkey => follows.add(pubkey))
    ;[...follows].map(pubkey => ['p', pubkey]).forEach(t => tags.push(t))
    contactList.id = null
    contactList.created_at = Math.floor(Date.now() / 1000)
    contactList.tags = tags
    contactList = await window.nostr.signEvent(contactList)
    let pubs = pool.publish(getWriteRelays(), contactList)
    Promise.all(pubs).catch(e => console.log('error publishing', e))
    alert('followed all')
    findProfile()
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}
          <Link to={'https://primal.net/p/' + profile.npub} target='_blank'>
            {profile.name}
          </Link>
          {' follows '}{followCount}{' nostriches'}
          <p/>
          Suggested follows:
          {showFollowAll && <button onClick={followAll} style={{ fontSize: '20px', marginLeft: '200px' }}>follow all</button>}
          <p/>
          {inactive.map(p => <div key={p.pubkey} style={{ fontSize: '20px', textDecoration: 'none' }}>
            <Link to={'/' + nip19.npubEncode(p.pubkey)}>
              <img src={p.picture} width={50} />
            </Link>{' '}
            <Link to={'https://primal.net/p/' + nip19.npubEncode(p.pubkey)} target='_blank'>
              {p.name}
            </Link>
            {' '}follows {p.follows}, friend score: {p.percentage}%
            {' '}{p.followsMe && <span style={{ color: 'green' }}>follows {profile.name}</span>}
            {!p.followsMe && <span style={{ color: 'red' }}>doesn't follow {profile.name}</span>}
          </div>)}
        </div>
      </header>
    </div>
  )
}

export default App
