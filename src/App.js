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
  const [progress, setProgress] = useState(0)
  const [contacts, setContacts] = useState([])
  const [showProgress, setShowProgress] = useState(false)
  const [months, setMonths] = useState(3)
  const [inactive, setInactive] = useState([])
  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://relayable.org',
    'wss://nostr.thank.eu',
  ].map(r => [r, { read: true, write: true }]))

  window.setProgress = setProgress

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
    setFollowCount(follows.length)
    let c = JSON.parse(profile.content)
    c.name = c.name || c.display_name || c.displayName || c.username
    setProfile(c)

    events = await pool.list(getAllRelays(), [{
      kinds: [3],
      authors: follows
    }])
    console.log('e', window.e)

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

    follows = {}
    events.forEach(e => {
      follows[e.pubkey] = e.tags.filter(t => t[0] === 'p').map(t => t[1])
    })
    let followedBy = {}
    events.forEach(follower => {
      follows[follower.pubkey].forEach(followee => {
        let list = followedBy[followee] || []
        followedBy[followee] = list
        if (follows[followee]?.includes(follower.pubkey)) {
          list.push(follower.pubkey)
        }
      })
    })
    let friends = Object.entries(followedBy)
      .sort((a, b) => b[1].length - a[1].length)
      .filter(e => e[1].length > 0)
    console.log('friends', friends)

    let friendPubkeys = friends.map(f => f[0])
    events = await pool.list(getAllRelays(), [{
      kinds: [0],
      authors: friendPubkeys
    }])

    let friendMap = {}
    events.forEach(e => {
      let list = friendMap[e.pubkey] || []
      friendMap[e.pubkey] = list
      list.push(e)
    })
    events = Object.values(friendMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })

    let topFriends = events.map(e => {
      const c = JSON.parse(e.content)
      return {
        pubkey: e.pubkey,
        name: c.name || c.display_name || c.displayName || c.username,
        picture: c.picture,
        score: followedBy[e.pubkey].length
      }
    })
    topFriends.sort((a, b) => b.score - a.score)
    setInactive(topFriends)
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}{profile.name}{' follows '}{followCount}{' nostriches'}
          <p />
          {/* <Link to='/'>Home</Link>{' '}
          <Link to='/npub1jk9h2jsa8hjmtm9qlcca942473gnyhuynz5rmgve0dlu6hpeazxqc3lqz7'>Ser</Link> */}
          {inactive.map(p => <div key={p.pubkey}>
            <Link style={{ fontSize: '20px', textDecoration: 'none' }} to={'/' + nip19.npubEncode(p.pubkey)}>
              <img src={p.picture} width={50} />{' '}{p.name}{' (friend score: '}{p.score}{')'}
            </Link>
          </div>)}
        </div>
      </header>
    </div>
  )
}

export default App
