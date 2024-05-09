import React from 'react'

import { createNamedContext } from './createNamedContext'
import { gHistory } from './history'
import type { TrailingSlashesTypes } from './util'

export interface LocationContextType extends URL {}

const LocationContext = createNamedContext<LocationContextType>('Location')

interface Location extends URL {}

interface LocationProviderProps {
  location?: Location
  trailingSlashes?: TrailingSlashesTypes
  children?: React.ReactNode
}

interface LocationProviderState {
  context: Location | undefined
}

class LocationProvider extends React.Component<
  LocationProviderProps,
  LocationProviderState
> {
  // When prerendering, there might be more than one level of location
  // providers. Use the values from the one above.
  static contextType = LocationContext
  declare context: React.ContextType<typeof LocationContext>
  HISTORY_LISTENER_ID: string | undefined = undefined

  state: LocationProviderState = {
    context: this.getContext(),
  }

  getContext() {
    let windowLocation

    if (typeof window !== 'undefined') {
      const { pathname } = window.location

      // Since we have to update the URL, we might as well handle the trailing
      // slash here, before matching.
      //
      // - never -> strip trailing slashes ("/about/" -> "/about")
      // - always -> add trailing slashes ("/about" -> "/about/")
      // - preserve -> do nothing ("/about" -> "/about", "/about/" -> "/about/")
      //
      switch (this.props.trailingSlashes) {
        case 'never':
          if (pathname.endsWith('/')) {
            window.history.replaceState(
              {},
              '',
              pathname.substr(0, pathname.length - 1),
            )
          }
          break

        case 'always':
          if (!pathname.endsWith('/')) {
            window.history.replaceState({}, '', pathname + '/')
          }
          break

        default:
          break
      }

      windowLocation = new URL(window.location.href)
    }

    return this.props.location || this.context || windowLocation
  }

  componentDidMount() {
    this.HISTORY_LISTENER_ID = gHistory.listen(() => {
      const context = this.getContext()
      this.setState((lastState) => {
        if (
          context?.pathname !== lastState?.context?.pathname ||
          context?.search !== lastState?.context?.search
        ) {
          globalThis?.scrollTo(0, 0)
        }

        return { context }
      })
    })
  }

  componentWillUnmount() {
    if (this.HISTORY_LISTENER_ID) {
      gHistory.remove(this.HISTORY_LISTENER_ID)
    }
  }

  render() {
    return (
      <LocationContext.Provider value={this.state.context}>
        {this.props.children}
      </LocationContext.Provider>
    )
  }
}

const useLocation = () => {
  const location = React.useContext(LocationContext)

  if (location === undefined) {
    throw new Error('useLocation must be used within a LocationProvider')
  }

  return location
}

export { LocationProvider, LocationContext, useLocation }
