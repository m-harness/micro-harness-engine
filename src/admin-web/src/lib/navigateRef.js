/** Bridge between axios interceptor (non-React) and React Router navigate. */
let _navigate = null
let _getPathname = () => window.location.pathname

export function setNavigateRef(navigate, getPathname) {
	_navigate = navigate
	_getPathname = getPathname || _getPathname
}

export function navigateTo(path) {
	if (_navigate) {
		_navigate(path, { replace: true })
	} else {
		window.location.href = path
	}
}

export function getPathname() {
	return _getPathname()
}
