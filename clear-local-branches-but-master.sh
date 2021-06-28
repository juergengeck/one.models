#!/bin/sh
# needs to be done while on master branch
git branch | grep -v "master" | xargs git branch -D
