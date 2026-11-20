#!/bin/bash
pkill -9 -f '^node (shot|runplan)\.cjs' ; pkill -9 -f '^/home/sandbox/.cache/ms-playwright' ; true
