#!/usr/bin/env python
"""Launcher that applies a NumPy-2.x compat shim to MintPy 1.6.2, then runs smallbaselineApp.

Why: MintPy 1.6.2's per-pixel inversion path (weighted WLS, and the partial-network
branch of the unweighted solver) assigns calc_inv_quality()'s size-1 array result into a
scalar slot:  inv_quality[idx] = inv_quali. NumPy 2.x refuses that (NumPy <2 silently
unwrapped it), so invert_network crashes with:
    ValueError: setting an array element with a sequence
    (cause) TypeError: only 0-dimensional arrays can be converted to Python scalars

The same per-pixel pattern appears in two MintPy modules, each crashing a different step:
  - ifgram_inversion.calc_inv_quality  -> invert_network    (inv_quality[idx] = inv_quali)
  - dem_error.estimate_dem_error       -> correct_topography (delta_z[idx]    = delta_z_i)
Both estimation functions are module globals resolved at call time, and smallbaselineApp
runs every step in-process, so wrapping them to return a scalar for size-1 results fixes
both without touching site-packages. The velocity step is vectorized and unaffected.

Usage: python insar/run_mintpy.py <same args you would pass to smallbaselineApp.py>
"""
import sys
import numpy as np
import mintpy.ifgram_inversion as ii
import mintpy.dem_error as de


def _scalar(x):
    """size-1 array -> Python scalar; everything else unchanged."""
    a = np.asarray(x)
    return a.ravel()[0] if a.size == 1 else x


_orig_calc_inv_quality = ii.calc_inv_quality
_orig_estimate_dem_error = de.estimate_dem_error


def _calc_inv_quality_scalar_safe(*args, **kwargs):
    # per-pixel callers do inv_quality[idx] = <result>, which NumPy 2.x rejects for size-1 arrays
    return _scalar(_orig_calc_inv_quality(*args, **kwargs))


def _estimate_dem_error_scalar_safe(*args, **kwargs):
    # returns (delta_z, ts_cor, ts_res); only delta_z is assigned per-pixel into a scalar slot
    delta_z, ts_cor, ts_res = _orig_estimate_dem_error(*args, **kwargs)
    return _scalar(delta_z), ts_cor, ts_res


ii.calc_inv_quality = _calc_inv_quality_scalar_safe
de.estimate_dem_error = _estimate_dem_error_scalar_safe

from mintpy.cli.smallbaselineApp import main

sys.exit(main(sys.argv[1:]))
