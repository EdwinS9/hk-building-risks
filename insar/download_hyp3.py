"""
Download finished HyP3 burst-InSAR products for the project, ready for MintPy.

Needs your Earthdata login (same account that submitted).
    pip install hyp3_sdk
    python3 insar/download_hyp3.py
"""
import sys, zipfile
from pathlib import Path

PROJECT_NAME = "hk_insar_011_021606_IW3"
DEST = Path("insar/products")


def main():
    try:
        import hyp3_sdk
    except ImportError:
        sys.exit("Run: pip install hyp3_sdk")

    hyp3 = hyp3_sdk.HyP3()
    batch = hyp3.find_jobs(name=PROJECT_NAME)
    print(f"found {len(batch)} jobs for '{PROJECT_NAME}'")
    if not batch.complete():
        print("Not all jobs are done yet. Waiting (Ctrl-C to stop and rerun later)...")
        batch = hyp3.watch(batch)

    DEST.mkdir(parents=True, exist_ok=True)
    succeeded = [j for j in batch.jobs if j.succeeded()]
    print(f"{len(succeeded)} succeeded. Downloading to {DEST}/ ...")
    for job in succeeded:
        for f in job.download_files(DEST):
            if f.suffix == ".zip":
                with zipfile.ZipFile(f) as z:
                    z.extractall(DEST)
    print("Done. Point the MintPy recipe book at insar/products/ "
          "(load_data -> smallbaselineApp.py -> export velocity.tif).")


if __name__ == "__main__":
    main()
