import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Hero } from '../components/sections/Hero'
import { Operator } from '../components/sections/Operator'
import { Why } from '../components/sections/Why'
import { Roll } from '../components/sections/Roll'
import { Practice } from '../components/sections/Practice'
import { Library } from '../components/sections/Library'
import { FeatureIndex } from '../components/sections/FeatureIndex'
import { NonGoals } from '../components/sections/NonGoals'
import { Install } from '../components/sections/Install'

// The landing page. The section order is the argument, not a feature list: a sentence to
// Claude ends in a piece playing → who does what, and the rules → why it is shaped so → what
// you see → how it teaches → what you have to play → the depth pages → what it will not
// become → the install, which nothing follows.
export function Landing() {
  return (
    <>
      <Nav />
      <Hero />
      <Operator />
      <Why />
      <Roll />
      <Practice />
      <Library />
      <FeatureIndex />
      <NonGoals />
      <Install />
      <Footer />
    </>
  )
}
