#!/bin/bash
echo $1
cd $1

for d in */ ; do
	bash $TYPEV_PATH/project_stats.sh $d
done
